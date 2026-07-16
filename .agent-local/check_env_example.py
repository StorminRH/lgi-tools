#!/usr/bin/env python3
"""Diff the committed env example against the typed server-env registry.

Registry entries come only from REQUIRED_ENV and VERBATIM_ENV in
``src/lib/env.ts``. Commented ``# KEY=`` declarations count as documented.
Platform-injected, build-inlined client, and tooling-owned keys are explicit
allowlists here so the comparison remains exact without inventing fake values.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from checker_common import Finding, run_checker


_PLATFORM_INJECTED = {"VERCEL_ENV", "VERCEL_URL", "NEXT_RUNTIME"}
_NEXT_PUBLIC_ALLOWLIST = {"NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL"}
_TOOLING_KEYS = {"CONVEX_DEPLOYMENT"}


def _relative(root: Path, path: Path) -> str:
    """Return a stable repo-relative path for a finding."""
    return path.relative_to(root).as_posix()


def _registry_keys(root: Path) -> tuple[dict[str, int], list[Finding]]:
    """Parse env registry keys and report structural changes that blind the check."""
    path = root / "src/lib/env.ts"
    raw_path = _relative(root, path)
    if not path.is_file():
        return {}, [Finding(raw_path, 1, "typed env registry is missing", "error")]

    lines = path.read_text(encoding="utf-8").splitlines()
    keys: dict[str, int] = {}
    findings: list[Finding] = []
    for block_name, schema_name in (
        ("REQUIRED_ENV", "required"),
        ("VERBATIM_ENV", "verbatim"),
    ):
        opener = re.compile(rf"^\s*const\s+{block_name}\s*=\s*\{{\s*$")
        start = next(
            (index for index, line in enumerate(lines) if opener.match(line)),
            None,
        )
        if start is None:
            findings.append(
                Finding(
                    raw_path,
                    1,
                    f"missing parseable {block_name} registry block",
                    "error",
                )
            )
            continue

        closed = False
        entry = re.compile(
            rf"^\s*([A-Z][A-Z0-9_]*)\s*:\s*{schema_name}\s*,\s*$"
        )
        for index in range(start + 1, len(lines)):
            line = lines[index]
            if re.match(r"^\s*}\s+as\s+const;\s*$", line):
                closed = True
                break
            if re.match(r"^\s*const\s+[A-Z][A-Z0-9_]*\s*=\s*\{\s*$", line):
                break
            stripped = line.strip()
            if not stripped or stripped.startswith("//"):
                continue
            match = entry.match(line)
            if match:
                keys[match.group(1)] = index + 1
                continue
            findings.append(
                Finding(
                    raw_path,
                    index + 1,
                    f"unparseable {block_name} registry entry",
                    "error",
                )
            )
        if not closed:
            findings.append(
                Finding(
                    raw_path,
                    start + 1,
                    f"unterminated {block_name} registry block",
                    "error",
                )
            )
    return keys, findings


def _example_keys(root: Path) -> tuple[dict[str, int], list[Finding]]:
    """Return live and commented KEY= declarations in the env example."""
    path = root / ".env.example"
    raw_path = _relative(root, path)
    if not path.is_file():
        return {}, [Finding(raw_path, 1, "committed env example is missing", "error")]

    keys: dict[str, int] = {}
    pattern = re.compile(r"^\s*(?:# )?([A-Z][A-Z0-9_]*)=")
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        match = pattern.match(line)
        if match:
            keys.setdefault(match.group(1), line_number)
    return keys, []


def collect_findings(root: Path) -> list[Finding]:
    """Report missing registry declarations and stale example declarations."""
    registry, registry_findings = _registry_keys(root)
    example, example_findings = _example_keys(root)
    findings = [*registry_findings, *example_findings]
    if registry_findings or example_findings:
        return findings

    env_path = root / "src/lib/env.ts"
    example_path = root / ".env.example"
    for key in sorted(set(registry) - set(example) - _PLATFORM_INJECTED):
        findings.append(
            Finding(
                _relative(root, env_path),
                registry[key],
                f"registry key {key} is missing from .env.example",
                "error",
            )
        )

    permitted_example_only = _NEXT_PUBLIC_ALLOWLIST | _TOOLING_KEYS
    for key in sorted(set(example) - set(registry) - permitted_example_only):
        findings.append(
            Finding(
                _relative(root, example_path),
                example[key],
                f"example key {key} is absent from the typed env registry",
                "error",
            )
        )
    return findings


def main() -> int:
    """Run the env-example checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
