#!/usr/bin/env python3
"""Measure countable repository facts for baseline-facing checkers.

This module is the single owner of the counting rules shared by the baseline
claims and Watch-trigger checkers. Production metrics mirror the audit scope:
``src`` plus ``convex``, TypeScript only, excluding tests and generated Convex
code. Measurement failures are explicit so callers can report anchored errors.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
import fnmatch
import json
from pathlib import Path
import re
import subprocess


class MeasureError(Exception):
    """A repository fact could not be measured; the message explains why."""


def _read_utf8(path: Path, root: Path) -> str:
    """Read one repository file or raise a path-specific measurement error."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        rel_path = path.relative_to(root).as_posix()
        raise MeasureError(f"file is not valid UTF-8: {rel_path}") from error


def _typescript_files(root: Path) -> list[Path]:
    """Return TypeScript files below the two audit-owned source roots."""
    files: list[Path] = []
    for directory in (root / "src", root / "convex"):
        if not directory.is_dir():
            continue
        files.extend(path for path in directory.rglob("*.ts") if path.is_file())
        files.extend(path for path in directory.rglob("*.tsx") if path.is_file())
    return sorted(set(files))


def _is_generated(path: Path, root: Path) -> bool:
    """Return whether a source path belongs to Convex generated output."""
    return "_generated" in path.relative_to(root).parts


def _is_test(path: Path) -> bool:
    """Return whether a TypeScript filename is a co-located Vitest suite."""
    return path.name.endswith((".test.ts", ".test.tsx"))


def _production_files(root: Path) -> list[Path]:
    """Return production TypeScript files in the audit measurement scope."""
    return [
        path
        for path in _typescript_files(root)
        if not _is_generated(path, root) and not _is_test(path)
    ]


def production_file_count(root: Path) -> int:
    """Count production TypeScript files under ``src`` and ``convex``."""
    return len(_production_files(root))


def test_file_count(root: Path) -> int:
    """Count co-located TypeScript test files outside generated output."""
    return sum(
        _is_test(path) and not _is_generated(path, root)
        for path in _typescript_files(root)
    )


def production_loc(root: Path) -> int:
    """Count physical lines across production TypeScript files."""
    return sum(
        len(_read_utf8(path, root).splitlines())
        for path in _production_files(root)
    )


def suppression_count(root: Path) -> int:
    """Count suppression markers across ``src`` and ``convex`` source files.

    Generated Convex JavaScript is included because its checked-in headers are
    part of the baseline's suppression inventory.
    """
    pattern = re.compile(r"eslint-disable|@ts-expect-error|fallow-ignore")
    source_files = set(_typescript_files(root))
    for directory in (root / "src", root / "convex"):
        if directory.is_dir():
            source_files.update(path for path in directory.rglob("*.js") if path.is_file())
            source_files.update(path for path in directory.rglob("*.jsx") if path.is_file())
    return sum(
        len(pattern.findall(_read_utf8(path, root)))
        for path in source_files
    )


def export_count(root: Path, rel_path: str) -> int:
    """Count lines beginning with ``export`` in one named repository file."""
    path = root / rel_path
    if not path.is_file():
        raise MeasureError(f"missing file: {rel_path}")
    return sum(
        bool(re.match(r"^export\b", line))
        for line in _read_utf8(path, root).splitlines()
    )


def named_file_count(root: Path, rel_paths: Iterable[str]) -> int:
    """Count existing files from one explicit repository-relative path set."""
    paths = tuple(rel_paths)
    if not paths:
        raise MeasureError("path set is empty")
    normalized = tuple(Path(rel_path) for rel_path in paths)
    if any(
        not rel_path
        or path.is_absolute()
        or ".." in path.parts
        for rel_path, path in zip(paths, normalized)
    ):
        raise MeasureError("path set must contain safe repository-relative paths")
    return sum((root / path).is_file() for path in normalized)


def _pattern_matches(rel_path: str, pattern: str) -> bool:
    """Match Fallow's slash-separated glob patterns for explicit zones."""
    if pattern.endswith("/**") and rel_path.startswith(pattern[:-3] + "/"):
        return True
    return fnmatch.fnmatchcase(rel_path, pattern)


def _pattern_files(root: Path, patterns: Iterable[str]) -> set[str]:
    """Find files that could match explicit zone patterns without scanning deps."""
    matches: set[str] = set()
    for pattern in patterns:
        parts = Path(pattern).parts
        wildcard_at = next(
            (index for index, part in enumerate(parts) if any(char in part for char in "*?[")),
            None,
        )
        if wildcard_at is None:
            candidate = root / pattern
            if candidate.is_file():
                matches.add(candidate.relative_to(root).as_posix())
            continue
        base = root.joinpath(*parts[:wildcard_at])
        if not base.is_dir():
            continue
        for candidate in base.rglob("*"):
            if not candidate.is_file():
                continue
            rel_path = candidate.relative_to(root).as_posix()
            if _pattern_matches(rel_path, pattern):
                matches.add(rel_path)
    return matches


def zone_file_count(root: Path, zone_name: str) -> int:
    """Count files assigned to one explicit-pattern Fallow boundary zone.

    Zones are evaluated in declared order because Fallow uses first-match-wins.
    Auto-discovered targets are deliberately unsupported: the Watch grammar is
    a closed measurement specification, not a second boundary engine.
    """
    config_path = root / ".fallowrc.json"
    if not config_path.is_file():
        raise MeasureError("missing file: .fallowrc.json")
    try:
        config = json.loads(_read_utf8(config_path, root))
        zones = config["boundaries"]["zones"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise MeasureError(".fallowrc.json has no parseable boundary zones") from error
    if not isinstance(zones, list):
        raise MeasureError(".fallowrc.json boundary zones must be a list")
    if not any(
        isinstance(zone, dict) and zone.get("name") == zone_name for zone in zones
    ):
        raise MeasureError(f"unknown zone: {zone_name}")

    considered: list[tuple[str, list[str]]] = []
    for zone in zones:
        if not isinstance(zone, dict) or not isinstance(zone.get("name"), str):
            raise MeasureError(".fallowrc.json contains an invalid boundary zone")
        name = zone["name"]
        if "autoDiscover" in zone:
            if name == zone_name:
                raise MeasureError(f"zone {zone_name} uses autoDiscover")
            raise MeasureError(
                f"zone {zone_name} follows unsupported autoDiscover zone {name}"
            )
        patterns = zone.get("patterns")
        if patterns is not None:
            if not isinstance(patterns, list) or not all(
                isinstance(pattern, str) for pattern in patterns
            ):
                raise MeasureError(f"zone {name} has invalid patterns")
            considered.append((name, patterns))
        if name == zone_name:
            break
    candidates = _pattern_files(
        root,
        (pattern for _, patterns in considered for pattern in patterns),
    )
    count = 0
    for rel_path in candidates:
        owner = next(
            (
                name
                for name, patterns in considered
                if any(_pattern_matches(rel_path, pattern) for pattern in patterns)
            ),
            None,
        )
        if owner == zone_name:
            count += 1
    return count


def _run_dupes(root: Path) -> object:
    """Run the repository-local Fallow duplication scan and decode its JSON."""
    executable = root / "node_modules/.bin/fallow"
    if not executable.is_file():
        raise MeasureError("missing Fallow executable: node_modules/.bin/fallow")
    result = subprocess.run(
        [str(executable), "dupes", "--format", "json"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown failure"
        raise MeasureError(f"Fallow duplication scan failed: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise MeasureError("Fallow duplication scan returned invalid JSON") from error


def clone_file_counts(
    root: Path,
    run_dupes: Callable[[Path], object] | None = None,
) -> dict[str, int]:
    """Map each Fallow clone fingerprint to its distinct instance-file count."""
    payload = (run_dupes or _run_dupes)(root)
    if not isinstance(payload, dict) or not isinstance(payload.get("clone_groups"), list):
        raise MeasureError("Fallow duplication output has no clone_groups array")
    counts: dict[str, int] = {}
    for group in payload["clone_groups"]:
        if not isinstance(group, dict):
            raise MeasureError("Fallow duplication output contains an invalid clone group")
        fingerprint = group.get("fingerprint")
        instances = group.get("instances")
        if not isinstance(fingerprint, str) or not isinstance(instances, list):
            raise MeasureError("Fallow clone group lacks a fingerprint or instances")
        if not all(
            isinstance(instance, dict) and isinstance(instance.get("file"), str)
            for instance in instances
        ):
            raise MeasureError(f"Fallow clone group {fingerprint} has invalid instances")
        files = {instance["file"] for instance in instances}
        counts[fingerprint] = len(files)
    return counts
