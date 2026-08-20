#!/usr/bin/env python3
"""Cross-check lifecycle evidence that the stage resolver does not own.

The checker is read-only. Contradictory artifact states are errors; snapshot
timing (delivery evidence awaiting its marker flip) is a warning. Markdown
marker and lifecycle-table parsing stay owned by
``resolve_development_state.py`` and are imported rather than reimplemented.
"""

from __future__ import annotations

from pathlib import Path
import json
import re
import sys

from tools._lib.checker_common import Finding, find_line, run_checker
from tools.lifecycle.resolve_development_state import (
    RoadmapRow as _RoadmapRow,
    active_roadmap as _active_roadmap,
    marker,
    parse_contract_index,
)


_POLICY_MANIFEST = Path("tools/policy/policy-manifest.json")


def _relative(root: Path, path: Path) -> str:
    """Return a stable repo-relative path for a finding."""
    return path.relative_to(root).as_posix()


def _procedure_policy_findings(root: Path) -> list[Finding]:
    """Check lifecycle schema files for required section wording."""
    manifest_path = root / _POLICY_MANIFEST
    if not manifest_path.is_file():
        return []
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [
            Finding(
                _POLICY_MANIFEST.as_posix(),
                1,
                f"invalid JSON: {exc}",
                "error",
            )
        ]
    policies = manifest.get("procedurePolicies", {})
    if not policies:
        return []
    if not isinstance(policies, dict):
        return [
            Finding(
                _POLICY_MANIFEST.as_posix(),
                1,
                "procedurePolicies must be an object",
                "error",
            )
        ]

    findings: list[Finding] = []
    for raw_path, raw_policy in policies.items():
        path = root / str(raw_path)
        if not path.is_file():
            findings.append(
                Finding(str(raw_path), 1, "missing procedure policy target", "error")
            )
            continue
        text = path.read_text(encoding="utf-8")
        policy = raw_policy if isinstance(raw_policy, dict) else {}
        position = -1
        for pattern in policy.get("orderedRequired", []):
            match = re.search(str(pattern), text[position + 1 :], flags=re.IGNORECASE)
            if match is None:
                findings.append(
                    Finding(
                        str(raw_path),
                        1,
                        f"missing ordered policy `{pattern}`",
                        "error",
                    )
                )
                continue
            position += match.end()
    return findings


def _execution_evidence_findings(
    root: Path,
    roadmap: Path,
    rows: list[_RoadmapRow],
    contract_index: Path,
) -> list[Finding]:
    """Cross-check session-plan execution markers against roadmap delivery state."""
    findings: list[Finding] = []
    statuses = {row.subversion: row for row in rows}
    version = roadmap.stem.removeprefix("VERSION_").removesuffix("_PLAN").replace("_", ".")
    indexed = parse_contract_index(contract_index)
    executions = {
        session: marker(root / "docs/session-plans" / version / f"{session}.md", "Execution status")
        for session in indexed
    }
    sessions_by_subversion: dict[str, list[str]] = {}
    for session, (subversion, _contract) in indexed.items():
        sessions_by_subversion.setdefault(subversion, []).append(session)
    for session, (subversion, _contract) in indexed.items():
        row = statuses.get(subversion)
        plan = root / "docs/session-plans" / version / f"{session}.md"
        execution = executions[session]
        if row is None or execution not in {"Pending", "Complete"}:
            continue
        line = find_line(plan, "**Execution status:**")
        raw_plan = _relative(root, plan)
        sibling_sessions = sessions_by_subversion[subversion]
        all_sessions_complete = all(executions[sibling] == "Complete" for sibling in sibling_sessions)
        if (
            execution == "Complete"
            and not row.terminal
            and all_sessions_complete
            and session == sibling_sessions[-1]
        ):
            findings.append(
                Finding(
                    raw_plan,
                    line,
                    f"execution is Complete while roadmap {subversion} is {row.status}",
                    "error",
                )
            )
        if execution == "Pending" and row.terminal:
            findings.append(
                Finding(
                    raw_plan,
                    line,
                    f"roadmap {subversion} is {row.status} while execution remains Pending",
                    "warn",
                )
            )
    return findings


def collect_findings(root: Path) -> list[Finding]:
    """Collect every cross-artifact contradiction and snapshot-timing warning."""
    findings = _procedure_policy_findings(root)
    roadmap, version, rows, roadmap_errors = _active_roadmap(root)
    if roadmap is None or version is None:
        findings.extend(
            Finding("docs", 1, error, "error")
            for error in roadmap_errors
        )
        return findings

    contract_index = root / "docs/session-contracts" / version / "INDEX.md"
    findings.extend(_execution_evidence_findings(root, roadmap, rows, contract_index))
    return findings


def main() -> int:
    """Run the lifecycle-evidence checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
