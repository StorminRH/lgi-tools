#!/usr/bin/env python3
"""Recompute mechanically derivable claims in the code-health baseline.

The checker covers cheap factual claims only: five Step 1 counts, export counts
on named wide files, existence of files named by baseline tables, and the
``auth-surface`` zone count. Stale values are warnings because they can drift
mid-session; missing subjects or an unparseable required row are errors. The
checker reports only and never edits the baseline.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import re
import sys

from checker_common import Finding, find_line, run_checker
from repo_measures import (
    MeasureError,
    clone_file_counts,
    export_count,
    production_file_count,
    production_loc,
    suppression_count,
    test_file_count,
    zone_file_count,
)


BASELINE = "docs/CODE_HEALTH_BASELINE.md"
COUNT_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}
NAMED_FILE = re.compile(r"`((?:src|convex)/[^`]+\.[A-Za-z0-9]+)`")
EXPORTS = re.compile(r"\b(\d[\d,]*)\s+exports\b")
AUTH_SURFACE = re.compile(
    r"auth-surface\b.*?exactly\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+files\b",
    flags=re.IGNORECASE,
)


def _table_rows(lines: list[str]) -> list[tuple[int, str]]:
    """Return Markdown table rows with their 1-based source lines."""
    return [
        (line_number, line)
        for line_number, line in enumerate(lines, start=1)
        if line.lstrip().startswith("|") and line.rstrip().endswith("|")
    ]


def _current_cell(row: str) -> str | None:
    """Return a table row's Current cell when the row has enough columns."""
    cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
    return cells[1] if len(cells) >= 2 else None


def _integer(text: str | None) -> int | None:
    """Parse a leading comma-formatted integer from one assertion cell."""
    if text is None:
        return None
    match = re.match(r"^\s*(\d[\d,]*)\b", text)
    return int(match.group(1).replace(",", "")) if match else None


def _step_one_claims(
    root: Path,
    rows: list[tuple[int, str]],
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
    step_line = find_line(root / BASELINE, "## Step 1 metrics")
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
            findings.append(
                Finding(BASELINE, step_line, f"missing required Step 1 row: {label}", "error")
            )
            continue
        line_number, row = matched
        asserted = _integer(_current_cell(row))
        if asserted is None:
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"unparseable current value for Step 1 row: {label}",
                    "error",
                )
            )
            continue
        if isinstance(measurement, MeasureError):
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"cannot measure {label}: {measurement}",
                    "error",
                )
            )
            continue
        measured = measurement() if callable(measurement) else measurement
        if asserted != measured:
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"{label} asserted {asserted}, measured {measured}",
                    "warn",
                )
            )
    return findings


def _named_file_claims(
    root: Path,
    rows: list[tuple[int, str]],
) -> list[Finding]:
    """Check table-named file existence and any adjacent export assertion."""
    findings: list[Finding] = []
    for line_number, row in rows:
        paths = list(dict.fromkeys(NAMED_FILE.findall(row)))
        for rel_path in paths:
            if not (root / rel_path).is_file():
                findings.append(
                    Finding(
                        BASELINE,
                        line_number,
                        f"baseline table references missing file: {rel_path}",
                        "error",
                    )
                )
        export_match = EXPORTS.search(row)
        if not export_match or "carried" in row.lower():
            continue
        asserted = int(export_match.group(1).replace(",", ""))
        for rel_path in paths:
            if not (root / rel_path).is_file():
                continue
            try:
                measured = export_count(root, rel_path)
            except MeasureError as error:
                findings.append(
                    Finding(
                        BASELINE,
                        line_number,
                        f"cannot measure exports for {rel_path}: {error}",
                        "error",
                    )
                )
                continue
            if asserted != measured:
                findings.append(
                    Finding(
                        BASELINE,
                        line_number,
                        f"{rel_path} exports asserted {asserted}, measured {measured}",
                        "warn",
                    )
                )
    return findings


def _rails_lines(lines: list[str]) -> tuple[int, list[tuple[int, str]]]:
    """Return the Rails section heading line and its body lines."""
    start = next(
        (
            index
            for index, line in enumerate(lines)
            if line.strip() == "## Rails and exceptions"
        ),
        None,
    )
    if start is None:
        return 1, []
    body: list[tuple[int, str]] = []
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("## "):
            break
        body.append((index + 1, lines[index]))
    return start + 1, body


def _auth_surface_claim(root: Path, lines: list[str]) -> list[Finding]:
    """Diff the Rails section's explicit auth-surface file-count phrase."""
    heading_line, rails = _rails_lines(lines)
    matched = None
    for index, (line_number, _line) in enumerate(rails):
        window = " ".join(line for _, line in rails[index : index + 4])
        match = AUTH_SURFACE.search(window)
        if match:
            matched = (line_number, match)
            break
    if matched is None:
        return [
            Finding(
                BASELINE,
                heading_line,
                "Rails section has no parseable auth-surface exact-file claim",
                "warn",
            )
        ]
    line_number, match = matched
    raw_count = match.group(1).lower()
    asserted = int(raw_count) if raw_count.isdigit() else COUNT_WORDS[raw_count]
    try:
        measured = zone_file_count(root, "auth-surface")
    except MeasureError as error:
        return [
            Finding(
                BASELINE,
                line_number,
                f"cannot measure auth-surface files: {error}",
                "error",
            )
        ]
    if asserted == measured:
        return []
    return [
        Finding(
            BASELINE,
            line_number,
            f"auth-surface files asserted {asserted}, measured {measured}",
            "warn",
        )
    ]


def collect_findings(root: Path) -> list[Finding]:
    """Report stale and contradictory mechanically derivable baseline claims."""
    path = root / BASELINE
    if not path.is_file():
        return [Finding(BASELINE, 1, "code-health baseline is missing", "error")]
    lines = path.read_text(encoding="utf-8").splitlines()
    rows = _table_rows(lines)
    return [
        *_step_one_claims(root, rows),
        *_named_file_claims(root, rows),
        *_auth_surface_claim(root, lines),
    ]


def main() -> int:
    """Run the baseline-claims checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
