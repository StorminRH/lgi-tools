#!/usr/bin/env python3
"""Shared delivery contract for the local lifecycle checkers.

Owns one decision: how a checker finding is represented and reported. Findings
are anchored to a repo-relative path and 1-based line, and are either errors
(contradictions that block) or warnings (suspicious timing/state that reports
without blocking). Markdown parsing remains owned by the lifecycle resolver.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from dataclasses import dataclass
import json
from pathlib import Path


_DEFAULT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Finding:
    """One checker verdict anchored to a repo-relative file and 1-based line."""

    path: str
    line: int
    message: str
    severity: str

    def __post_init__(self) -> None:
        if self.line < 1:
            raise ValueError("finding line must be positive")
        if self.severity not in {"error", "warn"}:
            raise ValueError("finding severity must be 'error' or 'warn'")

    def render(self) -> str:
        """Return the stable file-and-line form consumed by the drift harness."""
        return f"{self.path}:{self.line}: {self.message}"


def find_line(path: Path, needle: str) -> int:
    """Return the first 1-based line containing needle, or line 1 if absent."""
    if not path.is_file():
        return 1
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if needle in line:
            return line_number
    return 1


def _report(findings: Sequence[Finding]) -> dict[str, list[str]]:
    """Group findings into the JSON error and warning arrays used by every CLI."""
    return {
        "errors": [finding.render() for finding in findings if finding.severity == "error"],
        "warnings": [finding.render() for finding in findings if finding.severity == "warn"],
    }


def run_checker(
    collect: Callable[[Path], list[Finding]],
    argv: Sequence[str] | None = None,
) -> int:
    """Run one checker CLI and block under --check only when errors are present."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=_DEFAULT_ROOT)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args(argv)

    payload = _report(collect(args.root.resolve()))
    print(json.dumps(payload, indent=2 if args.pretty else None, sort_keys=True))
    return 1 if args.check and payload["errors"] else 0
