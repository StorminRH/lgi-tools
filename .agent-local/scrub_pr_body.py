#!/usr/bin/env python3
"""Block personal identifiers from reaching a public PR title or body.

Patterns come from generic tracked shapes, identifiers derived from the local
runtime, and an optional gitignored extension file. Every match is anchored to
the candidate body-file; the checker never edits or publishes the candidate.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import os
from pathlib import Path
import platform
import re
import subprocess
import sys

from checker_common import Finding, run_checker


LOCAL_PATTERNS = ".agent-local/pr-privacy-local-patterns.txt"


@dataclass(frozen=True)
class PatternRule:
    """One named privacy pattern used to classify candidate text."""

    label: str
    pattern: re.Pattern[str]


GENERIC_RULES = (
    PatternRule(
        "email address",
        re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    ),
    PatternRule(
        "local absolute path",
        re.compile(
            r"(?:/(?:Users|home)/[^/\s]+(?:/|\b)|"
            r"/(?:private/(?:tmp|var)|var/folders|tmp|Volumes)/|"
            r"[A-Z]:\\Users\\[^\\\s]+(?:\\|\b))",
            re.IGNORECASE,
        ),
    ),
    PatternRule(
        "browser profile path",
        re.compile(
            r"(?:Library/Application Support/(?:Google/Chrome|Firefox)|"
            r"(?:Chrome|Firefox)[/\\](?:Profile|Profiles))",
            re.IGNORECASE,
        ),
    ),
    PatternRule(
        "machine hostname",
        re.compile(r"\b[A-Z0-9][A-Z0-9-]{1,62}\.local\b", re.IGNORECASE),
    ),
    PatternRule(
        "credential-shaped token",
        re.compile(
            r"\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|"
            r"github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|"
            r"sk-[A-Za-z0-9_-]{20,})\b"
        ),
    ),
)


def _add_arguments(parser: argparse.ArgumentParser) -> None:
    """Register the candidate PR title and body-file inputs."""
    parser.add_argument("--body-file", type=Path, required=True)
    parser.add_argument("--title")


def _git_value(root: Path, key: str) -> str:
    result = subprocess.run(
        ["git", "config", "--get", key],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def _runtime_rules(
    root: Path,
    *,
    environ: Mapping[str, str] | None = None,
    hostname: str | None = None,
    git_values: Sequence[str] | None = None,
) -> list[PatternRule]:
    """Derive exact local identifiers, with injectable sources for fixtures."""
    environment = os.environ if environ is None else environ
    if git_values is None:
        git_values = (
            _git_value(root, "user.name"),
            _git_value(root, "user.email"),
        )
    values = [*git_values]
    if len(git_values) > 1 and "@" in git_values[1]:
        values.append(git_values[1].partition("@")[0])
    values.extend(
        (
            environment.get("USER", ""),
            Path(environment.get("HOME", "/")).name,
            platform.node() if hostname is None else hostname,
        )
    )
    unique = sorted({value.strip() for value in values if len(value.strip()) >= 3})
    return [
        PatternRule(
            "operator or machine identifier",
            re.compile(rf"(?<![\w]){re.escape(value)}(?![\w])", re.IGNORECASE),
        )
        for value in unique
    ]


def _local_rules(path: Path) -> tuple[list[PatternRule], list[Finding]]:
    """Load the optional local regex registry and report invalid entries."""
    if not path.is_file():
        return [], []
    rules: list[PatternRule] = []
    findings: list[Finding] = []
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        expression = raw_line.strip()
        if not expression or expression.startswith("#"):
            continue
        try:
            pattern = re.compile(expression, re.IGNORECASE)
        except re.error as error:
            findings.append(
                Finding(
                    LOCAL_PATTERNS,
                    line_number,
                    f"invalid local privacy regex: {error}",
                    "error",
                )
            )
            continue
        rules.append(PatternRule("local operator identifier", pattern))
    return rules, findings


def _display_path(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.name


def collect_findings(
    root: Path,
    args: argparse.Namespace,
    *,
    runtime_rules: Sequence[PatternRule] | None = None,
) -> list[Finding]:
    """Report the first privacy classification matched on each candidate line."""
    body_path = args.body_file
    if not body_path.is_absolute():
        body_path = root / body_path
    body_path = body_path.resolve()
    body_rel = _display_path(root, body_path)
    if not body_path.is_file():
        return [Finding(body_rel, 1, "PR body-file does not exist", "error")]

    local_rules, findings = _local_rules(root / LOCAL_PATTERNS)
    rules = [
        *GENERIC_RULES,
        *(runtime_rules if runtime_rules is not None else _runtime_rules(root)),
        *local_rules,
    ]

    candidates = [
        (line_number, line, "PR body")
        for line_number, line in enumerate(
            body_path.read_text(encoding="utf-8").splitlines(),
            start=1,
        )
    ]
    if args.title:
        candidates.insert(0, (1, args.title, "PR title"))
    for line_number, line, location in candidates:
        for rule in rules:
            if rule.pattern.search(line):
                finding_path = (
                    f"{body_rel}#title" if location == "PR title" else body_rel
                )
                findings.append(
                    Finding(
                        finding_path,
                        line_number,
                        f"{location} contains {rule.label}",
                        "error",
                    )
                )
                break
    return findings


def main() -> int:
    """Run the PR privacy scrubber CLI."""
    return run_checker(collect_findings, add_arguments=_add_arguments)


if __name__ == "__main__":
    sys.exit(main())
