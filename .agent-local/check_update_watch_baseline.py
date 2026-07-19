#!/usr/bin/env python3
"""Validate docs/UPDATE_WATCH_BASELINE.md against package.json.

The baseline records operator-acknowledged state, never installed state.
This checker owns the completeness contract from session contract 3.9.3.5 §3:
the fenced update-watch-baseline block parses as the documented schema; the
dependency map equals the exact union of package.json dependencies and
devDependencies; the required sources from the collector's shared registry —
Vercel/Next.js, Neon, Convex, Upstash, developers.eveonline.com, and the
official EVE developer documentation — are each present exactly once with
their required watch domains; idRule values exist in the registry; watch
URLs are unique; per-entry fields are well-formed. Findings carry source
lines; the checker never edits anything.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from checker_common import Finding, find_line, run_checker
from update_watch_collect import BASELINE_PATH, ID_RULES, SOURCE_REGISTRY, parse_baseline


_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_GHSA_PATTERN = re.compile(r"^GHSA(-[a-z0-9]{4}){3}$")
_APPLIES_TO_PATTERN = re.compile(r"^.+@.+$")


def _package_dependency_names(root: Path) -> tuple[set[str] | None, list[Finding]]:
    """Return the exact union of dependencies and devDependencies, or findings."""
    path = root / "package.json"
    if not path.is_file():
        return None, [Finding("package.json", 1, "package.json is missing", "error")]
    try:
        package = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, [Finding("package.json", 1, f"package.json is malformed: {exc}", "error")]
    return (
        set(package.get("dependencies", {})) | set(package.get("devDependencies", {})),
        [],
    )


def _check_dependencies(
    baseline: dict, expected: set[str], path: Path, findings: list[Finding]
) -> None:
    """Require the baseline dependency map to equal the package.json union exactly."""
    dependencies = baseline.get("dependencies")
    if not isinstance(dependencies, dict):
        findings.append(
            Finding(BASELINE_PATH, find_line(path, '"dependencies"'), "dependencies must be an object", "error")
        )
        return
    for name in sorted(expected - set(dependencies)):
        findings.append(
            Finding(
                BASELINE_PATH,
                find_line(path, '"dependencies"'),
                f"dependency {name} from package.json is missing from the baseline",
                "error",
            )
        )
    for name in sorted(set(dependencies) - expected):
        findings.append(
            Finding(
                BASELINE_PATH,
                find_line(path, f'"{name}"'),
                f"baseline dependency {name} is not in package.json",
                "error",
            )
        )
    for name, entry in sorted(dependencies.items()):
        acknowledged = entry.get("acknowledgedMajor") if isinstance(entry, dict) else None
        if not isinstance(acknowledged, int) or isinstance(acknowledged, bool) or acknowledged < 0:
            findings.append(
                Finding(
                    BASELINE_PATH,
                    find_line(path, f'"{name}"'),
                    f"dependency {name} needs a non-negative integer acknowledgedMajor",
                    "error",
                )
            )


def _check_advisories(baseline: dict, path: Path, findings: list[Finding]) -> None:
    """Require well-formed advisory acknowledgements with observed applicability."""
    advisories = baseline.get("acknowledgedAdvisories")
    if not isinstance(advisories, list):
        findings.append(
            Finding(
                BASELINE_PATH,
                find_line(path, '"acknowledgedAdvisories"'),
                "acknowledgedAdvisories must be a list",
                "error",
            )
        )
        return
    for entry in advisories:
        identifier = entry.get("id") if isinstance(entry, dict) else None
        anchor = find_line(path, str(identifier)) if identifier else find_line(path, '"acknowledgedAdvisories"')
        if not isinstance(identifier, str) or not _GHSA_PATTERN.match(identifier):
            findings.append(
                Finding(BASELINE_PATH, anchor, f"advisory id {identifier!r} is not a GHSA id", "error")
            )
        applies_to = entry.get("appliesTo") if isinstance(entry, dict) else None
        if not isinstance(applies_to, str) or not _APPLIES_TO_PATTERN.match(applies_to):
            findings.append(
                Finding(
                    BASELINE_PATH,
                    anchor,
                    f"advisory {identifier!r} needs appliesTo in <package>@<observed range> form",
                    "error",
                )
            )


def _check_sources(baseline: dict, path: Path, findings: list[Finding]) -> None:
    """Require every registry source exactly once with exact domains and valid fields."""
    seen_urls: dict[str, str] = {}
    for section in ("services", "eveSurface"):
        entries = baseline.get(section)
        if not isinstance(entries, list):
            findings.append(
                Finding(BASELINE_PATH, find_line(path, f'"{section}"'), f"{section} must be a list", "error")
            )
            continue
        required = {source.name: source for source in SOURCE_REGISTRY if source.section == section}
        names = [entry.get("name") for entry in entries if isinstance(entry, dict)]
        for name in sorted(required.keys() - set(names)):
            findings.append(
                Finding(
                    BASELINE_PATH,
                    find_line(path, f'"{section}"'),
                    f"required source {name} is missing from {section}",
                    "error",
                )
            )
        for name in names:
            anchor = find_line(path, str(name))
            if names.count(name) > 1 and name is not None:
                findings.append(
                    Finding(BASELINE_PATH, anchor, f"source {name} appears more than once", "error")
                )
        for entry in entries:
            if not isinstance(entry, dict):
                findings.append(
                    Finding(BASELINE_PATH, find_line(path, f'"{section}"'), f"{section} entry must be an object", "error")
                )
                continue
            name = entry.get("name")
            anchor = find_line(path, str(name)) if name else find_line(path, f'"{section}"')
            source = required.get(name)
            if source is None:
                findings.append(
                    Finding(
                        BASELINE_PATH,
                        anchor,
                        f"source {name!r} is not in the collector's registry for {section}",
                        "error",
                    )
                )
                continue
            watch = entry.get("watch")
            if not isinstance(watch, list) or not all(isinstance(url, str) for url in watch) or not watch:
                findings.append(
                    Finding(BASELINE_PATH, anchor, f"source {name} needs a non-empty watch URL list", "error")
                )
                watch = []
            hosts = {urlsplit(url).netloc.lower() for url in watch}
            if watch and hosts != set(source.domains):
                findings.append(
                    Finding(
                        BASELINE_PATH,
                        anchor,
                        f"source {name} watch domains {sorted(hosts)} must equal {sorted(source.domains)}",
                        "error",
                    )
                )
            for url in watch:
                if url in seen_urls:
                    findings.append(
                        Finding(BASELINE_PATH, find_line(path, url), f"watch URL {url} is duplicated", "error")
                    )
                seen_urls[url] = name
            id_rule = entry.get("idRule")
            if id_rule not in ID_RULES:
                findings.append(
                    Finding(BASELINE_PATH, anchor, f"source {name} idRule {id_rule!r} is not in the registry", "error")
                )
            scan_since = entry.get("scanSince")
            if not isinstance(scan_since, str) or not _DATE_PATTERN.match(scan_since):
                findings.append(
                    Finding(BASELINE_PATH, anchor, f"source {name} scanSince must be YYYY-MM-DD", "error")
                )
            acknowledged = entry.get("acknowledgedItems")
            if not isinstance(acknowledged, list) or not all(
                isinstance(item, str) for item in acknowledged
            ):
                findings.append(
                    Finding(
                        BASELINE_PATH,
                        anchor,
                        f"source {name} acknowledgedItems must be a list of canonical id strings",
                        "error",
                    )
                )


def collect_findings(root: Path) -> list[Finding]:
    """Report every baseline schema, completeness, and registry-lock violation."""
    path = root / BASELINE_PATH
    if not path.is_file():
        return [Finding(BASELINE_PATH, 1, "update-watch baseline is missing", "error")]
    try:
        baseline = parse_baseline(path.read_text(encoding="utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        return [Finding(BASELINE_PATH, 1, f"baseline block is unusable: {exc}", "error")]

    findings: list[Finding] = []
    expected, package_findings = _package_dependency_names(root)
    findings.extend(package_findings)
    if expected is not None:
        _check_dependencies(baseline, expected, path, findings)
    _check_advisories(baseline, path, findings)
    _check_sources(baseline, path, findings)
    return findings


def main() -> int:
    """Run the update-watch baseline checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
