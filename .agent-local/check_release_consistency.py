#!/usr/bin/env python3
"""Cross-check release identity before a PR and after reconciliation.

Owns one decision: whether APP_VERSION, the newest active changelog entry, and
the active roadmap delivery rows tell one consistent story. The valid stories
are ``pre-pr`` (the triplet names the first nonterminal row) and ``reconciled``
(the triplet names the latest terminal row). The checker is read-only.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys

from checker_common import Finding, find_line, run_checker
from resolve_development_state import active_roadmap


APP_VERSION_PATH = "src/config/app-version.ts"
APP_VERSION_RE = re.compile(
    r"^export const APP_VERSION = ['\"](\d+\.\d+\.\d+(?:\.\d+)*)['\"];$",
    re.MULTILINE,
)
CHANGELOG_HEADING_RE = re.compile(
    r"^### v(\d+\.\d+\.\d+(?:\.\d+)*)\s+—\s+\d{4}-\d{2}-\d{2}\s*$",
    re.MULTILINE,
)


def _add_arguments(parser: argparse.ArgumentParser) -> None:
    """Register the optional call-site signature constraint."""
    parser.add_argument("--expect", choices=("pre-pr", "reconciled"))


def _app_version(path: Path) -> str | None:
    if not path.is_file():
        return None
    match = APP_VERSION_RE.search(path.read_text(encoding="utf-8"))
    return match.group(1) if match else None


def _changelog_versions(path: Path) -> list[str]:
    if not path.is_file():
        return []
    return CHANGELOG_HEADING_RE.findall(path.read_text(encoding="utf-8"))


def collect_findings(root: Path, args: argparse.Namespace) -> list[Finding]:
    """Report contradictions in the active release identity triplet."""
    findings: list[Finding] = []
    app_path = root / APP_VERSION_PATH
    app_version = _app_version(app_path)
    if app_version is None:
        findings.append(
            Finding(APP_VERSION_PATH, 1, "missing parseable APP_VERSION", "error")
        )

    roadmap_path, active_version, rows, roadmap_errors = active_roadmap(root)
    roadmap_rel = (
        roadmap_path.relative_to(root).as_posix()
        if roadmap_path is not None
        else "docs"
    )
    findings.extend(
        Finding(roadmap_rel, 1, message, "error") for message in roadmap_errors
    )
    if roadmap_path is None or active_version is None or not rows:
        if not roadmap_errors:
            findings.append(
                Finding(roadmap_rel, 1, "no active roadmap with status rows", "error")
            )
        return findings

    seen_nonterminal = False
    ordered = True
    for row in rows:
        if row.terminal and seen_nonterminal:
            findings.append(
                Finding(
                    roadmap_rel,
                    find_line(roadmap_path, f"| {row.subversion} |"),
                    "roadmap delivery rows must form one terminal prefix",
                    "error",
                )
            )
            ordered = False
        if not row.terminal:
            seen_nonterminal = True

    changelog_rel = f"content/changelog/v{active_version}.md"
    changelog_path = root / changelog_rel
    changelog_versions = _changelog_versions(changelog_path)
    if not changelog_versions:
        # New-version opening transient: a fresh roadmap has landed (every row
        # nonterminal) but APP_VERSION still names the previous version, and the new
        # changelog file opens only with the first sub-version's PR. That triplet is a
        # legal, self-clearing state, not a contradiction. It clears the moment the
        # first sub-version merges.
        opening = (
            app_version is not None
            and not any(row.terminal for row in rows)
            and app_version.split(".")[:2] != active_version.split(".")[:2]
        )
        if opening:
            if args.expect is not None:
                findings.append(
                    Finding(
                        roadmap_rel,
                        find_line(roadmap_path, "## Status"),
                        f"release state is opening, expected {args.expect}",
                        "error",
                    )
                )
            return findings
        findings.append(
            Finding(changelog_rel, 1, "missing parseable changelog entry", "error")
        )
        return findings
    newest_changelog = changelog_versions[0]

    if app_version is not None and app_version not in changelog_versions:
        findings.append(
            Finding(
                APP_VERSION_PATH,
                find_line(app_path, "APP_VERSION"),
                f"changelog entry missing for APP_VERSION {app_version}",
                "error",
            )
        )
    elif app_version is not None and app_version != newest_changelog:
        findings.append(
            Finding(
                APP_VERSION_PATH,
                find_line(app_path, "APP_VERSION"),
                f"APP_VERSION {app_version} does not match newest changelog "
                f"heading {newest_changelog}",
                "error",
            )
        )

    observed: str | None = None
    if app_version == newest_changelog and ordered:
        first_nonterminal = next(
            (row.subversion for row in rows if not row.terminal),
            None,
        )
        latest_terminal = next(
            (row.subversion for row in reversed(rows) if row.terminal),
            None,
        )
        if app_version == first_nonterminal:
            observed = "pre-pr"
        elif app_version == latest_terminal:
            observed = "reconciled"

    if app_version == newest_changelog and observed is None and ordered:
        findings.append(
            Finding(
                roadmap_rel,
                find_line(roadmap_path, "## Status"),
                f"release triplet {app_version} matches neither the first "
                "nonterminal nor latest terminal roadmap row",
                "error",
            )
        )
    if args.expect is not None and observed is not None and observed != args.expect:
        findings.append(
            Finding(
                roadmap_rel,
                find_line(roadmap_path, f"| {app_version} |"),
                f"release state is {observed}, expected {args.expect}",
                "error",
            )
        )
    return findings


def main() -> int:
    """Run the release-consistency checker CLI."""
    return run_checker(collect_findings, add_arguments=_add_arguments)


if __name__ == "__main__":
    sys.exit(main())
