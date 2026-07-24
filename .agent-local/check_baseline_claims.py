#!/usr/bin/env python3
"""Validate the strict code-health baseline and recompute cheap claims.

The canonical form owns the baseline's allowed sections, identity keys, metric
registry, and table columns. This checker rejects content outside that schema,
freezes version-start values against ``origin/main``, and reports cheap live
measurement drift without editing the baseline.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
import sys

from checker_common import Finding, find_line, run_checker
from repo_measures import (
    MeasureError,
    clone_file_counts,
    export_count,
    named_file_count,
    production_file_count,
    production_loc,
    suppression_count,
    test_file_count,
)


BASELINE = "docs/CODE_HEALTH_BASELINE.md"
BASELINE_TEMPLATE_RELPATH = "docs/workflows/schema/code-health-baseline.md"
NAMED_FILE = re.compile(r"`((?:src|convex)/[^`]+\.[A-Za-z0-9]+)`")
EXPORTS = re.compile(r"\b(\d[\d,]*)\s+exports\b")
WATCH_CARRIER = re.compile(r"^- Watch \(AF-\d{3}\)$")
AUTH_CONTRACT_PATHS = (
    "src/platform/auth/types.ts",
    "src/db/auth-schema.ts",
    "src/platform/auth/api-contract.ts",
)
AUTH_CONTRACT_METRIC = (
    "Auth contract paths (`src/platform/auth/types.ts`, "
    "`src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`)"
)
LEGACY_AUTH_SURFACE_METRIC = "`auth-surface` files"


@dataclass(frozen=True)
class BaselineSchema:
    """Structured vocabulary derived from the canonical baseline form."""

    sections: tuple[str, ...]
    identity_columns: tuple[str, ...]
    identity_keys: tuple[str, ...]
    metric_columns: tuple[str, ...]
    metric_keys: tuple[str, ...]


@dataclass(frozen=True)
class BaselineAnchor:
    """Ordered version-start values and their enforcement availability state."""

    state: str
    values: tuple[tuple[str, str], ...] = ()


def _cells(row: str) -> list[str]:
    """Return stripped cells from one pipe-delimited Markdown table row."""
    return [cell.strip() for cell in row.strip().strip("|").split("|")]


def _is_separator(cells: list[str]) -> bool:
    """Return whether every cell is a Markdown table separator token."""
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _section_entries(lines: list[str]) -> list[tuple[str, int, int]]:
    """Return level-two section titles and their half-open body spans."""
    starts = [
        (line.removeprefix("## ").strip(), index)
        for index, line in enumerate(lines)
        if line.startswith("## ")
    ]
    return [
        (title, start + 1, starts[index + 1][1] if index + 1 < len(starts) else len(lines))
        for index, (title, start) in enumerate(starts)
    ]


def _section_rows(
    lines: list[str],
    start: int,
    end: int,
) -> list[tuple[int, list[str]]]:
    """Return table cells and 1-based source lines from one section body."""
    return [
        (index + 1, _cells(lines[index]))
        for index in range(start, end)
        if lines[index].lstrip().startswith("|") and lines[index].rstrip().endswith("|")
    ]


def parse_baseline_schema(root: Path) -> BaselineSchema | None:
    """Parse the canonical form into the complete structured baseline schema.

    The form owns allowed section titles, identity keys, metric keys, and table
    columns. Missing, duplicated, or structurally incomplete form data returns
    ``None`` so callers block instead of silently weakening enforcement.
    """
    path = root / BASELINE_TEMPLATE_RELPATH
    if not path.is_file():
        return None
    lines = path.read_text(encoding="utf-8").splitlines()
    entries = _section_entries(lines)
    sections = tuple(title for title, _start, _end in entries)
    if not sections or len(sections) != len(set(sections)):
        return None

    identity: tuple[tuple[str, ...], tuple[str, ...]] | None = None
    metrics: tuple[tuple[str, ...], tuple[str, ...]] | None = None
    for _title, start, end in entries:
        rows = _section_rows(lines, start, end)
        if not rows:
            continue
        header = tuple(rows[0][1])
        if header == ("Field", "Value"):
            if len(rows) < 3 or len(rows[1][1]) != 2 or not _is_separator(rows[1][1]):
                return None
            keys = tuple(
                cells[0]
                for _line, cells in rows[2:]
                if len(cells) == 2
            )
            if identity is not None or not keys or len(keys) != len(set(keys)):
                return None
            identity = (header, keys)
        elif len(header) == 4 and header[0] == "Metric":
            if set(header) != {"Metric", "Version-start", "Current", "Delta"}:
                return None
            if len(rows) < 3 or len(rows[1][1]) != 4 or not _is_separator(rows[1][1]):
                return None
            keys = tuple(
                cells[0]
                for _line, cells in rows[2:]
                if len(cells) == 4
            )
            if metrics is not None or not keys or len(keys) != len(set(keys)):
                return None
            metrics = (header, keys)

    if identity is None or metrics is None:
        return None
    return BaselineSchema(
        sections=sections,
        identity_columns=identity[0],
        identity_keys=identity[1],
        metric_columns=metrics[0],
        metric_keys=metrics[1],
    )


def _table_rows(lines: list[str]) -> list[tuple[int, str]]:
    """Return Markdown table rows with their 1-based source lines."""
    return [
        (line_number, line)
        for line_number, line in enumerate(lines, start=1)
        if line.lstrip().startswith("|") and line.rstrip().endswith("|")
    ]


def _current_cell(row: str, schema: BaselineSchema) -> str | None:
    """Return a strict metric row's template-indexed Current cell."""
    cells = _cells(row)
    return (
        cells[schema.metric_columns.index("Current")]
        if len(cells) == len(schema.metric_columns)
        else None
    )


def _integer(text: str | None) -> int | None:
    """Parse a leading comma-formatted integer from one assertion cell."""
    if text is None:
        return None
    match = re.match(r"^\s*(\d[\d,]*)\b", text)
    return int(match.group(1).replace(",", "")) if match else None


def _derived_delta(version_start: str, current: str) -> str:
    """Return the canonical delta for two baseline value cells."""
    integer = re.compile(r"\d[\d,]*")
    if not integer.fullmatch(version_start) or not integer.fullmatch(current):
        return "—"
    difference = int(current.replace(",", "")) - int(version_start.replace(",", ""))
    return f"+{difference}" if difference > 0 else str(difference)


def _schema_only_findings(
    root: Path,
    lines: list[str],
    schema: BaselineSchema,
) -> list[Finding]:
    """Reject every line, section, and row outside the canonical form."""
    findings: list[Finding] = []
    entries = _section_entries(lines)
    observed_sections = tuple(title for title, _start, _end in entries)
    for title, start, _end in entries:
        if title not in schema.sections:
            findings.append(
                Finding(BASELINE, start, f"section is not allowed by the baseline schema: {title}", "error")
            )
    if observed_sections != schema.sections:
        findings.append(
            Finding(
                BASELINE,
                1,
                f"baseline sections must be exactly {list(schema.sections)!r}",
                "error",
            )
        )

    current_section: str | None = None
    in_trigger = False
    title_lines = 0
    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped:
            continue
        if line.startswith("# "):
            title_lines += 1
            if line_number != 1 or title_lines > 1:
                findings.append(Finding(BASELINE, line_number, "unexpected level-one heading", "error"))
            continue
        if line.startswith("## "):
            current_section = line.removeprefix("## ").strip()
            continue
        if stripped == "```watch-trigger":
            if current_section != "Watch findings" or in_trigger:
                findings.append(Finding(BASELINE, line_number, "misplaced watch-trigger fence", "error"))
            in_trigger = True
            continue
        if stripped == "```":
            if not in_trigger:
                findings.append(Finding(BASELINE, line_number, "unmatched closing fence", "error"))
            in_trigger = False
            continue
        if in_trigger:
            continue
        if line.lstrip().startswith("|") and line.rstrip().endswith("|"):
            if current_section not in {"Snapshot", "Metrics"}:
                findings.append(
                    Finding(BASELINE, line_number, "table row is outside a schema table section", "error")
                )
            continue
        if current_section == "Watch findings" and WATCH_CARRIER.fullmatch(stripped):
            continue
        findings.append(
            Finding(BASELINE, line_number, "free prose or unsupported baseline content", "error")
        )
    if title_lines != 1:
        findings.append(Finding(BASELINE, 1, "baseline requires exactly one level-one heading", "error"))
    if in_trigger:
        findings.append(Finding(BASELINE, len(lines) or 1, "unterminated watch-trigger fence", "error"))

    by_section = {title: _section_rows(lines, start, end) for title, start, end in entries}
    snapshot_rows = by_section.get("Snapshot", [])
    metric_rows = by_section.get("Metrics", [])
    identity_seen: list[str] = []
    metric_seen: list[str] = []

    if not snapshot_rows or tuple(snapshot_rows[0][1]) != schema.identity_columns:
        findings.append(
            Finding(
                BASELINE,
                find_line(root / BASELINE, "## Snapshot"),
                "invalid Snapshot table header",
                "error",
            )
        )
    if (
        len(snapshot_rows) < 2
        or len(snapshot_rows[1][1]) != len(schema.identity_columns)
        or not _is_separator(snapshot_rows[1][1])
    ):
        findings.append(Finding(BASELINE, 1, "invalid Snapshot table separator", "error"))
    for line_number, cells in snapshot_rows[2:]:
        if len(cells) != len(schema.identity_columns):
            findings.append(Finding(BASELINE, line_number, "identity row must have exactly two cells", "error"))
            continue
        key = cells[0]
        if key not in schema.identity_keys:
            findings.append(Finding(BASELINE, line_number, f"identity key is not registered: {key}", "error"))
        if key in identity_seen:
            findings.append(Finding(BASELINE, line_number, f"duplicate identity key: {key}", "error"))
        identity_seen.append(key)

    if not metric_rows or tuple(metric_rows[0][1]) != schema.metric_columns:
        findings.append(Finding(BASELINE, 1, "invalid Metrics table header", "error"))
    if (
        len(metric_rows) < 2
        or len(metric_rows[1][1]) != len(schema.metric_columns)
        or not _is_separator(metric_rows[1][1])
    ):
        findings.append(Finding(BASELINE, 1, "invalid Metrics table separator", "error"))
    metric_index = {column: index for index, column in enumerate(schema.metric_columns)}
    for line_number, cells in metric_rows[2:]:
        if len(cells) != len(schema.metric_columns):
            findings.append(Finding(BASELINE, line_number, "metric row must have exactly four cells", "error"))
            continue
        key = cells[metric_index["Metric"]]
        version_start = cells[metric_index["Version-start"]]
        current = cells[metric_index["Current"]]
        delta = cells[metric_index["Delta"]]
        if key not in schema.metric_keys:
            findings.append(Finding(BASELINE, line_number, f"metric key is not registered: {key}", "error"))
        if key in metric_seen:
            findings.append(Finding(BASELINE, line_number, f"duplicate metric key: {key}", "error"))
        metric_seen.append(key)
        expected_delta = _derived_delta(version_start, current)
        if delta != expected_delta:
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"metric delta for {key} must be {expected_delta!r}, got {delta!r}",
                    "error",
                )
            )

    for key in schema.identity_keys:
        if key not in identity_seen:
            findings.append(Finding(BASELINE, 1, f"missing required identity key: {key}", "error"))
    for key in schema.metric_keys:
        if key not in metric_seen:
            findings.append(Finding(BASELINE, 1, f"missing required metric: {key}", "error"))
    return findings


def _git_show_main(root: Path) -> str | None:
    """Read the committed baseline from origin/main without mutating git state."""
    result = subprocess.run(
        ["git", "show", f"origin/main:{BASELINE}"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    return result.stdout if result.returncode == 0 and result.stdout else None


def _anchor_values(text: str) -> tuple[tuple[str, str], ...] | None:
    """Parse ordered metric/version-start pairs from strict baseline text."""
    lines = text.splitlines()
    header_index = next(
        (
            index
            for index, line in enumerate(lines)
            if line.lstrip().startswith("|")
            and line.rstrip().endswith("|")
            and _cells(line) == ["Metric", "Version-start", "Current", "Delta"]
        ),
        None,
    )
    if header_index is None:
        return None
    values: list[tuple[str, str]] = []
    for line in lines[header_index + 1 :]:
        if line.startswith("## "):
            break
        if not line.lstrip().startswith("|") or not line.rstrip().endswith("|"):
            continue
        cells = _cells(line)
        if _is_separator(cells):
            continue
        if len(cells) != 4:
            return ()
        key = (
            AUTH_CONTRACT_METRIC
            if cells[0] == LEGACY_AUTH_SURFACE_METRIC
            else cells[0]
        )
        if not key or any(saved == key for saved, _value in values):
            return ()
        values.append((key, cells[1]))
    return tuple(values)


def frozen_version_start(
    root: Path,
    *,
    read: Callable[[Path], str | None] = _git_show_main,
) -> BaselineAnchor:
    """Return origin/main's ordered version-start anchor and enforcement state.

    ``enforced`` means main carries a parseable strict column, ``bootstrap``
    means main is the pre-migration format without that column, and
    ``unavailable`` means git/read or strict-anchor parsing failed. Callers must
    block on ``unavailable``; injectable ``read`` keeps tests independent of git.
    """
    text = read(root)
    if text is None:
        return BaselineAnchor("unavailable")
    values = _anchor_values(text)
    if values is None:
        return BaselineAnchor("bootstrap")
    if not values:
        return BaselineAnchor("unavailable")
    return BaselineAnchor("enforced", values)


def _working_version_start(
    lines: list[str],
    schema: BaselineSchema,
) -> tuple[tuple[str, str, int], ...]:
    """Return registered working metric keys, version-start cells, and lines."""
    rows: list[tuple[str, str, int]] = []
    key_index = schema.metric_columns.index("Metric")
    start_index = schema.metric_columns.index("Version-start")
    for line_number, row in _table_rows(lines):
        cells = _cells(row)
        if len(cells) == len(schema.metric_columns) and cells[key_index] in schema.metric_keys:
            rows.append((cells[key_index], cells[start_index], line_number))
    return tuple(rows)


def _version_start_findings(
    root: Path,
    rows: tuple[tuple[str, str, int], ...],
    anchor: BaselineAnchor,
) -> list[Finding]:
    """Reject working version-start key or value drift from origin/main."""
    del root
    if anchor.state == "bootstrap":
        return []
    if anchor.state == "unavailable":
        return [Finding(BASELINE, 1, "version-start anchor from origin/main is unavailable", "error")]

    expected = dict(anchor.values)
    current = {key: value for key, value, _line in rows}
    line_by_key = {key: line for key, _value, line in rows}
    findings: list[Finding] = []
    missing = sorted(set(expected) - set(current))
    added = sorted(set(current) - set(expected))
    if missing or added:
        findings.append(
            Finding(
                BASELINE,
                1,
                f"version-start metric keys differ from origin/main: missing={missing!r}, added={added!r}",
                "error",
            )
        )
    for key in sorted(set(expected) & set(current)):
        if expected[key] != current[key]:
            findings.append(
                Finding(
                    BASELINE,
                    line_by_key[key],
                    f"version-start value changed for {key}: expected {expected[key]!r}, got {current[key]!r}",
                    "error",
                )
            )
    return findings


def _step_one_claims(
    root: Path,
    rows: list[tuple[int, str]],
    schema: BaselineSchema,
) -> list[Finding]:
    """Diff the five required Step 1 count rows against live measurements."""
    clone_count: int | MeasureError
    try:
        clone_count = len(clone_file_counts(root))
    except MeasureError as error:
        clone_count = error
    claims: dict[str, Callable[[], int] | int | MeasureError] = {
        "Production TS/TSX files": lambda: production_file_count(root),
        "Production TS/TSX LOC": lambda: production_loc(root),
        "Test files": lambda: test_file_count(root),
        "Source suppressions": lambda: suppression_count(root),
        "Whole-version Fallow clone groups": clone_count,
    }
    findings: list[Finding] = []
    step_line = find_line(root / BASELINE, "## Metrics")
    for label, measurement in claims.items():
        matched = next(
            (
                (line_number, row)
                for line_number, row in rows
                if re.match(rf"^\|\s*{re.escape(label)}\s*\|", row)
            ),
            None,
        )
        if matched is None:
            findings.append(Finding(BASELINE, step_line, f"missing required Step 1 row: {label}", "error"))
            continue
        line_number, row = matched
        asserted = _integer(_current_cell(row, schema))
        if asserted is None:
            findings.append(
                Finding(BASELINE, line_number, f"unparseable current value for Step 1 row: {label}", "error")
            )
            continue
        if isinstance(measurement, MeasureError):
            findings.append(Finding(BASELINE, line_number, f"cannot measure {label}: {measurement}", "error"))
            continue
        measured = measurement() if callable(measurement) else measurement
        if asserted != measured:
            findings.append(
                Finding(BASELINE, line_number, f"{label} asserted {asserted}, measured {measured}", "warn")
            )
    return findings


def _named_file_claims(
    root: Path,
    rows: list[tuple[int, str]],
    schema: BaselineSchema,
) -> list[Finding]:
    """Check table-named file existence and Current-cell export assertions."""
    findings: list[Finding] = []
    for line_number, row in rows:
        paths = list(dict.fromkeys(NAMED_FILE.findall(row)))
        for rel_path in paths:
            if not (root / rel_path).is_file():
                findings.append(
                    Finding(BASELINE, line_number, f"baseline table references missing file: {rel_path}", "error")
                )
        current = _current_cell(row, schema) or ""
        export_match = EXPORTS.search(current)
        if not export_match or "carried" in current.lower():
            continue
        asserted = int(export_match.group(1).replace(",", ""))
        for rel_path in paths:
            if not (root / rel_path).is_file():
                continue
            try:
                measured = export_count(root, rel_path)
            except MeasureError as error:
                findings.append(Finding(BASELINE, line_number, f"cannot measure exports for {rel_path}: {error}", "error"))
                continue
            if asserted != measured:
                findings.append(
                    Finding(BASELINE, line_number, f"{rel_path} exports asserted {asserted}, measured {measured}", "warn")
                )
    return findings


def _auth_contract_paths_claim(
    root: Path,
    rows: list[tuple[int, str]],
    schema: BaselineSchema,
) -> list[Finding]:
    """Diff the registered auth-contract path set's Current file count."""
    matched = next(
        (
            (line_number, row)
            for line_number, row in rows
            if row.startswith(f"| {AUTH_CONTRACT_METRIC} |")
        ),
        None,
    )
    if matched is None:
        return [Finding(BASELINE, 1, "no parseable auth contract path claim", "warn")]
    line_number, row = matched
    asserted = _integer(_current_cell(row, schema))
    if asserted is None:
        return [Finding(BASELINE, line_number, "unparseable auth contract path Current value", "error")]
    try:
        measured = named_file_count(root, AUTH_CONTRACT_PATHS)
    except MeasureError as error:
        return [Finding(BASELINE, line_number, f"cannot measure auth contract paths: {error}", "error")]
    if asserted == measured:
        return []
    return [Finding(BASELINE, line_number, f"auth contract paths asserted {asserted}, measured {measured}", "warn")]


def collect_findings(root: Path) -> list[Finding]:
    """Report strict-schema, frozen-anchor, and live-measurement findings."""
    path = root / BASELINE
    if not path.is_file():
        return [Finding(BASELINE, 1, "code-health baseline is missing", "error")]
    schema = parse_baseline_schema(root)
    if schema is None:
        return [
            Finding(
                BASELINE_TEMPLATE_RELPATH,
                1,
                "canonical code-health baseline schema is missing or unusable",
                "error",
            )
        ]
    anchor = frozen_version_start(root)
    if anchor.state == "unavailable":
        return [Finding(BASELINE, 1, "version-start anchor from origin/main is unavailable", "error")]

    lines = path.read_text(encoding="utf-8").splitlines()
    rows = _table_rows(lines)
    working = _working_version_start(lines, schema)
    return [
        *_step_one_claims(root, rows, schema),
        *_named_file_claims(root, rows, schema),
        *_auth_contract_paths_claim(root, rows, schema),
        *_schema_only_findings(root, lines, schema),
        *_version_start_findings(root, working, anchor),
    ]


def main() -> int:
    """Run the strict baseline checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
