#!/usr/bin/env python3
"""Print the promoted baseline tables for a master-version adoption.

Read-only: reads ``origin/main``'s committed baseline, promotes ``Current`` into
``Version-start`` for shared schema rows, fills newly registered rows from live
measurements, and prints Markdown. Never writes the baseline. Ref fidelity is
required so new-row values are reproducible from the recorded promotion ref.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from pathlib import Path
import subprocess
import sys

from check_baseline_claims import (
    BASELINE,
    _cells,
    _code_ref_sha,
    _derived_delta,
    _is_separator,
    _snapshot_values,
    parse_baseline_schema,
)
from repo_measures import (
    MeasureError,
    capability_operation_count,
    diagnostic_suppression_count,
    fallow_zone_entry_count,
    retained_css_family_count,
    sli_count,
    test_contract_suppression_count,
    ui_adoption_exemption_count,
    vendor_integration_count,
)


FIDELITY_PATHS = ("src", "convex", ".fallowrc.json")


def _git_show_main(root: Path) -> str:
    """Read the committed baseline from origin/main or raise MeasureError."""
    result = subprocess.run(
        ["git", "show", f"origin/main:{BASELINE}"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.strip() or "unavailable"
        raise MeasureError(f"origin/main baseline unavailable: {detail}")
    return result.stdout


def _main_metric_currents(text: str) -> dict[str, str]:
    """Map metric keys to Current cells from committed baseline text."""
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
        raise MeasureError("origin/main baseline has no Metrics table")
    values: dict[str, str] = {}
    for line in lines[header_index + 1 :]:
        if line.startswith("## "):
            break
        if not line.lstrip().startswith("|") or not line.rstrip().endswith("|"):
            continue
        cells = _cells(line)
        if _is_separator(cells):
            continue
        if len(cells) != 4:
            raise MeasureError("origin/main baseline has a malformed Metrics row")
        if not cells[0] or cells[0] in values:
            raise MeasureError(
                "origin/main baseline has an empty or duplicate Metrics key"
            )
        values[cells[0]] = cells[2]
    if not values:
        raise MeasureError("origin/main baseline Metrics table is empty")
    return values


def _ensure_ref_fidelity(root: Path, promotion_ref: str) -> None:
    """Require the promotion ref exists and fidelity paths match it exactly."""
    typed = subprocess.run(
        ["git", "cat-file", "-t", promotion_ref],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if typed.returncode != 0 or typed.stdout.strip() != "commit":
        raise MeasureError(f"promotion Code ref is not a commit: {promotion_ref}")
    diff = subprocess.run(
        ["git", "diff", "--quiet", promotion_ref, "--", *FIDELITY_PATHS],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if diff.returncode not in (0, 1):
        detail = diff.stderr.strip() or "git diff failed"
        raise MeasureError(f"cannot verify promotion-ref fidelity: {detail}")
    if diff.returncode == 1:
        raise MeasureError(
            "working tree differs from promotion ref on "
            + ", ".join(FIDELITY_PATHS)
        )
    for extra_args, category in (
        (("--others", "--exclude-standard"), "untracked"),
        (("--others", "--ignored", "--exclude-standard"), "ignored"),
    ):
        extra = subprocess.run(
            ["git", "ls-files", *extra_args, "--", *FIDELITY_PATHS],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
        )
        if extra.returncode != 0:
            detail = extra.stderr.strip() or "git ls-files failed"
            raise MeasureError(f"cannot verify promotion-ref fidelity: {detail}")
        paths = extra.stdout.splitlines()
        if paths:
            raise MeasureError(
                f"working tree has {category} promotion input: {paths[0]}"
            )


def _live_measurements(root: Path) -> dict[str, str]:
    """Return Current cells for rows introduced by the adoption schema."""
    return {
        "Diagnostic suppressions": str(diagnostic_suppression_count(root)),
        "Test contract suppressions": str(test_contract_suppression_count(root)),
        "Fallow boundary zones (configured)": str(fallow_zone_entry_count(root)),
        "Vendor-resilience integrations": str(vendor_integration_count(root)),
        "Instrumented capability operations": str(capability_operation_count(root)),
        "Owned service-level indicators": str(sli_count(root)),
        "UI adoption exemptions": str(ui_adoption_exemption_count(root)),
        "Retained legacy CSS families": str(retained_css_family_count(root)),
    }


def render_capture(
    root: Path,
    *,
    read_main: Callable[[Path], str] | None = None,
    measure: Callable[[Path], dict[str, str]] | None = None,
    ensure_fidelity: Callable[[Path, str], None] | None = None,
) -> str:
    """Build the promoted Snapshot and Metrics Markdown for one adoption."""
    schema = parse_baseline_schema(root)
    if schema is None:
        raise MeasureError("canonical code-health baseline schema is missing or unusable")
    main_text = (read_main or _git_show_main)(root)
    identity = _snapshot_values(main_text)
    if identity is None:
        raise MeasureError("origin/main baseline Snapshot is unreadable")
    promotion_ref = _code_ref_sha(identity.get("Code ref"))
    if promotion_ref is None:
        raise MeasureError("origin/main baseline Code ref is missing or malformed")
    (ensure_fidelity or _ensure_ref_fidelity)(root, promotion_ref)
    main_current = _main_metric_currents(main_text)
    new_keys = set(schema.metric_keys) - set(main_current)
    live = (measure or _live_measurements)(root) if new_keys else {}

    metric_rows: list[str] = []
    for key in schema.metric_keys:
        if key in main_current:
            version_start = main_current[key]
            current = version_start
        else:
            if key not in live:
                raise MeasureError(f"no live measurement for new metric row: {key}")
            version_start = live[key]
            current = live[key]
        delta = _derived_delta(version_start, current)
        metric_rows.append(f"| {key} | {version_start} | {current} | {delta} |")

    capture_date = identity.get("Date")
    app_version = identity.get("App version")
    code_ref = identity.get("Code ref")
    measurement_scope = identity.get("Measurement scope")
    if not all((capture_date, app_version, code_ref, measurement_scope)):
        raise MeasureError(
            "origin/main baseline Snapshot lacks a required identity value"
        )
    return "\n".join(
        [
            "## Snapshot",
            "",
            "| Field | Value |",
            "| --- | --- |",
            f"| Date | {capture_date} |",
            f"| App version | {app_version} |",
            f"| Code ref | {code_ref} |",
            f"| Measurement scope | {measurement_scope} |",
            f"| Version-start ref | {promotion_ref} |",
            "",
            "## Metrics",
            "",
            "| Metric | Version-start | Current | Delta |",
            "| --- | ---: | ---: | ---: |",
            *metric_rows,
            "",
        ]
    )


def main() -> int:
    """Print the promoted baseline tables or exit 1 with a clear error."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(render_capture(args.root.resolve()), end="")
    except MeasureError as error:
        print(f"capture_version_start: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
