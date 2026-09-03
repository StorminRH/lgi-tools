#!/usr/bin/env python3
"""Verify the resolver-owned version-archive transition.

The pre phase checks that every roadmap row is terminal and the live
bundle exists. The post phase also proves that the copied roadmap,
contract set, session plans, and session as-built records are
byte-identical to their active sources. Copying and deletion remain
skill actions; this checker is read-only.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys

from tools._lib.checker_common import Finding, find_line, run_checker
from tools.lifecycle.resolve_development_state import active_roadmap

REQUIRED_SETS = ("session-contracts", "session-plans")
OPTIONAL_SETS = ("session-as-built",)

def _add_arguments(parser: argparse.ArgumentParser) -> None:
    """Register archive phase and optional archive-root override."""
    parser.add_argument("--phase", choices=("pre", "post"), default="pre")
    parser.add_argument("--archive-root", type=Path)

def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def _active_bundle_files(
    root: Path,
    version: str,
    roadmap_path: Path,
) -> tuple[list[tuple[Path, Path]], list[Finding]]:
    files = [(Path(roadmap_path.name), roadmap_path)]
    findings: list[Finding] = []
    for name in (*REQUIRED_SETS, *OPTIONAL_SETS):
        source_dir = root / "docs" / name / version
        source_files = (
            sorted(path for path in source_dir.rglob("*") if path.is_file())
            if source_dir.is_dir()
            else []
        )
        if not source_files:
            if name in REQUIRED_SETS:
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
