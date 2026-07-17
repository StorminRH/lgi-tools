#!/usr/bin/env python3
"""Verify the version-archive transition of DEVELOPMENT_LIFECYCLE section 7.

The pre phase checks the four file-state preconditions for archival. The post
phase also proves that the copied roadmap, contract set, session plans, and
audit plan are byte-identical to their active sources. Copying and deletion
remain operator or skill actions; this checker is read-only.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import re
import sys

from checker_common import Finding, find_line, run_checker
from resolve_development_state import (
    active_roadmap,
    marker,
    parse_audit_findings,
)


BASELINE = "docs/CODE_HEALTH_BASELINE.md"


def _add_arguments(parser: argparse.ArgumentParser) -> None:
    """Register archive phase and optional archive-root override."""
    parser.add_argument("--phase", choices=("pre", "post"), default="pre")
    parser.add_argument("--archive-root", type=Path)


def _table_value(path: Path, field: str) -> str | None:
    if not path.is_file():
        return None
    pattern = re.compile(rf"^\|\s*{re.escape(field)}\s*\|\s*(.*?)\s*\|\s*$")
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if match:
            return match.group(1).strip().strip("`")
    return None


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _active_bundle_files(
    root: Path,
    version: str,
    roadmap_path: Path,
) -> tuple[list[tuple[Path, Path]], list[Finding]]:
    files = [(Path(roadmap_path.name), roadmap_path)]
    findings: list[Finding] = []
    for name in ("session-contracts", "session-plans", "version-audits"):
        source_dir = root / "docs" / name / version
        source_files = sorted(path for path in source_dir.rglob("*") if path.is_file())
        if not source_files:
            findings.append(
                Finding(
                    f"docs/{name}/{version}",
                    1,
                    "archive source set is missing or empty",
                    "error",
                )
            )
            continue
        files.extend(
            (Path(name) / source.relative_to(source_dir), source)
            for source in source_files
        )
    return files, findings


def collect_findings(root: Path, args: argparse.Namespace) -> list[Finding]:
    """Report failed archive preconditions and post-copy fidelity checks."""
    findings: list[Finding] = []
    roadmap_path, version, rows, roadmap_errors = active_roadmap(root)
    roadmap_rel = (
        roadmap_path.relative_to(root).as_posix()
        if roadmap_path is not None
        else "docs"
    )
    findings.extend(
        Finding(roadmap_rel, 1, message, "error") for message in roadmap_errors
    )
    if roadmap_path is None or version is None or not rows:
        if not roadmap_errors:
            findings.append(
                Finding(roadmap_rel, 1, "no active roadmap with status rows", "error")
            )
        return findings

    for row in rows:
        if not row.terminal:
            findings.append(
                Finding(
                    roadmap_rel,
                    find_line(roadmap_path, f"| {row.subversion} |"),
                    f"roadmap row {row.subversion} is not terminal",
                    "error",
                )
            )

    audit_rel = f"docs/version-audits/{version}/PLAN.md"
    audit_path = root / audit_rel
    audit_status = (marker(audit_path, "Audit status") or "").casefold()
    if audit_status != "complete":
        findings.append(
            Finding(
                audit_rel,
                find_line(audit_path, "Audit status"),
                "Audit status must be Complete before archive",
                "error",
            )
        )

    cycle_raw = marker(audit_path, "Audit cycle") or ""
    cycle = int(cycle_raw) if cycle_raw.isdigit() and int(cycle_raw) > 0 else None
    if cycle is None:
        findings.append(
            Finding(
                audit_rel,
                find_line(audit_path, "Audit cycle"),
                "Audit cycle must be a positive integer",
                "error",
            )
        )
    audited_ref = marker(audit_path, "Audited ref") or ""
    if not re.fullmatch(r"[0-9a-f]{40}", audited_ref):
        findings.append(
            Finding(
                audit_rel,
                find_line(audit_path, "Audited ref"),
                "Audited ref must be a full lowercase commit SHA",
                "error",
            )
        )

    audit_findings, parse_errors = parse_audit_findings(audit_path)
    findings.extend(Finding(audit_rel, 1, error, "error") for error in parse_errors)
    for audit_finding in audit_findings:
        if audit_finding.actionable and audit_finding.status != "verified":
            findings.append(
                Finding(
                    audit_rel,
                    find_line(audit_path, f"| {audit_finding.identifier} |"),
                    f"actionable finding {audit_finding.identifier} is not Verified",
                    "error",
                )
            )
        if (
            cycle is not None
            and audit_finding.actionable
            and audit_finding.first_seen == cycle
        ):
            # A clean close requires a later full cycle with no new actionable
            # findings; Verified status never creates a same-cycle exception.
            findings.append(
                Finding(
                    audit_rel,
                    find_line(audit_path, f"| {audit_finding.identifier} |"),
                    f"current audit cycle contains new actionable finding "
                    f"{audit_finding.identifier}",
                    "error",
                )
            )

    baseline_path = root / BASELINE
    baseline_version = _table_value(baseline_path, "App version")
    if baseline_version is None or not (
        baseline_version == version or baseline_version.startswith(f"{version}.")
    ):
        findings.append(
            Finding(
                BASELINE,
                find_line(baseline_path, "| App version |"),
                f"baseline App version must name audited version {version}",
                "error",
            )
        )
    baseline_ref_value = _table_value(baseline_path, "Code ref") or ""
    baseline_ref_match = re.search(r"[0-9a-f]{40}", baseline_ref_value)
    baseline_ref = baseline_ref_match.group(0) if baseline_ref_match else ""
    if not audited_ref or baseline_ref != audited_ref:
        findings.append(
            Finding(
                BASELINE,
                find_line(baseline_path, "| Code ref |"),
                "baseline Code ref must equal the audit Audited ref",
                "error",
            )
        )

    if args.phase != "post":
        return findings

    bundle_files, bundle_findings = _active_bundle_files(
        root,
        version,
        roadmap_path,
    )
    findings.extend(bundle_findings)
    archive_root = args.archive_root
    if archive_root is None:
        archive_root = root.parent / "LGI Tools Document Archive"
    elif not archive_root.is_absolute():
        archive_root = root / archive_root
    destination = archive_root.resolve() / "versions" / version
    for relative_path, source in bundle_files:
        copied = destination / relative_path
        display = (Path("versions") / version / relative_path).as_posix()
        if not copied.is_file():
            findings.append(
                Finding(display, 1, "archive copy is missing", "error")
            )
        elif _sha256(source) != _sha256(copied):
            findings.append(
                Finding(display, 1, "archive copy differs from active source", "error")
            )
    return findings


def main() -> int:
    """Run the archive-transition verifier CLI."""
    return run_checker(collect_findings, add_arguments=_add_arguments)


if __name__ == "__main__":
    sys.exit(main())
