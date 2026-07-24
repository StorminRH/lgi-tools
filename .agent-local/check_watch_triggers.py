#!/usr/bin/env python3
"""Evaluate fenced Watch triggers from the live code-health baseline.

The grammar is the closed trip-form specification in
``docs/workflows/version-audit.md``:
when an expression is true, its Watch finding is reported as a warning for
operator review. The checker never edits the baseline or promotes a finding.
Unparseable expressions and unmeasurable subjects are blocking contradictions.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import re
import sys

from checker_common import Finding, run_checker
from repo_measures import (
    MeasureError,
    clone_file_counts,
    export_count,
    named_file_count,
    pattern_file_count,
    zone_file_count,
)


BASELINE = "docs/CODE_HEALTH_BASELINE.md"
TRIGGER = re.compile(
    r"^(AF-\d{3}):\s*"
    r"(exports|files|clones)\(([^)]+)\)\s*"
    r"(>=|>|<=|<|==)\s*(\d+)$"
)
OPERATORS: dict[str, Callable[[int, int], bool]] = {
    ">=": lambda measured, threshold: measured >= threshold,
    ">": lambda measured, threshold: measured > threshold,
    "<=": lambda measured, threshold: measured <= threshold,
    "<": lambda measured, threshold: measured < threshold,
    "==": lambda measured, threshold: measured == threshold,
}


def _trigger_lines(path: Path) -> tuple[list[tuple[int, str]], list[Finding]]:
    """Return nonblank trigger lines plus structural fence findings."""
    raw_path = BASELINE
    if not path.is_file():
        return [], [Finding(raw_path, 1, "code-health baseline is missing", "error")]
    lines = path.read_text(encoding="utf-8").splitlines()
    triggers: list[tuple[int, str]] = []
    findings: list[Finding] = []
    in_block = False
    opening_line = 1
    for line_number, line in enumerate(lines, start=1):
        if line.strip() == "```watch-trigger":
            if in_block:
                findings.append(
                    Finding(raw_path, line_number, "nested watch-trigger fence", "error")
                )
            in_block = True
            opening_line = line_number
            continue
        if in_block and line.strip() == "```":
            in_block = False
            continue
        if in_block and line.strip():
            triggers.append((line_number, line.strip()))
    if in_block:
        findings.append(
            Finding(raw_path, opening_line, "unterminated watch-trigger fence", "error")
        )
    return triggers, findings


def _measure(
    root: Path,
    metric: str,
    argument: str,
    clone_counts: dict[str, int] | None,
) -> tuple[int, dict[str, int] | None]:
    """Measure one grammar expression and return any lazily loaded clone map."""
    if metric == "exports":
        return export_count(root, argument), clone_counts
    if metric == "files":
        if argument.startswith("zone:") and len(argument) > len("zone:"):
            return zone_file_count(root, argument.removeprefix("zone:")), clone_counts
        if argument.startswith("paths:"):
            paths = tuple(path.strip() for path in argument.removeprefix("paths:").split(","))
            return named_file_count(root, paths), clone_counts
        if argument.startswith("globs:"):
            patterns = tuple(
                pattern.strip() for pattern in argument.removeprefix("globs:").split(",")
            )
            return pattern_file_count(root, patterns), clone_counts
        raise MeasureError(
            "files() requires a zone:<name>, paths:<path,...>, or globs:<pattern,...> subject"
        )
    if metric == "clones":
        if not argument.startswith("dup:") or len(argument) == len("dup:"):
            raise MeasureError("clones() requires a dup:<fingerprint> subject")
        if clone_counts is None:
            clone_counts = clone_file_counts(root)
        return clone_counts.get(argument, 0), clone_counts
    raise MeasureError(f"unsupported Watch metric: {metric}")


def collect_findings(root: Path) -> list[Finding]:
    """Report malformed, unmeasurable, and tripped baseline Watch triggers."""
    path = root / BASELINE
    trigger_lines, findings = _trigger_lines(path)
    promoted: set[str] = set()
    clone_counts: dict[str, int] | None = None
    for line_number, line in trigger_lines:
        match = TRIGGER.fullmatch(line)
        if not match:
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"unparseable watch-trigger line: {line!r}",
                    "error",
                )
            )
            continue
        finding_id, metric, argument, operator, raw_threshold = match.groups()
        expression = f"{metric}({argument})"
        try:
            measured, clone_counts = _measure(
                root,
                metric,
                argument,
                clone_counts,
            )
        except MeasureError as error:
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"cannot measure {expression}: {error}",
                    "error",
                )
            )
            continue
        threshold = int(raw_threshold)
        if OPERATORS[operator](measured, threshold) and finding_id not in promoted:
            findings.append(
                Finding(
                    BASELINE,
                    line_number,
                    f"promote {finding_id} — {expression} = {measured} "
                    f"(trigger: {operator} {threshold})",
                    "warn",
                )
            )
            promoted.add(finding_id)
    return findings


def main() -> int:
    """Run the Watch-trigger checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
