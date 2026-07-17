#!/usr/bin/env python3
"""Cross-check lifecycle evidence that the stage resolver does not own.

The checker is read-only. Contradictory artifact states are errors; snapshot
timing (a stale SCRATCHPAD or delivery evidence awaiting its marker flip) is a
warning. Markdown marker and lifecycle-table parsing stay owned by
``resolve_development_state.py`` and are imported rather than reimplemented.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys

from checker_common import Finding, find_line, run_checker
from resolve_development_state import (
    AuditFinding as _AuditFinding,
    RoadmapRow as _RoadmapRow,
    active_roadmap as _active_roadmap,
    marker,
    parse_audit_findings,
    parse_contract_index,
    resolve,
)


_AF_ID = re.compile(r"AF-\d{3}")
_SESSION_ID = re.compile(r"\d+\.\d+\.\d+(?:\.\d+)*")


@dataclass(frozen=True)
class _BaselineEvidence:
    """Machine-readable AF carriers extracted from the live health baseline."""

    watch: dict[str, int]
    verified: dict[str, int]
    triggers: dict[str, int]
    queue: dict[str, tuple[str, int]]


def _relative(root: Path, path: Path) -> str:
    """Return a stable repo-relative path for a finding."""
    return path.relative_to(root).as_posix()


def _heading_section(path: Path, heading: str) -> list[tuple[int, str]]:
    """Return numbered lines below a level-two heading through the next peer."""
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    start = next(
        (
            index
            for index, line in enumerate(lines)
            if line.strip().casefold() == f"## {heading}".casefold()
        ),
        None,
    )
    if start is None:
        return []
    result: list[tuple[int, str]] = []
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("## "):
            break
        result.append((index + 1, lines[index]))
    return result


def _parse_campaign_queue(path: Path) -> dict[str, tuple[str, int]]:
    """Return AF ids and status cells from the baseline Campaign queue table."""
    section = _heading_section(path, "Campaign queue")
    header: list[str] | None = None
    status_index: int | None = None
    rows: dict[str, tuple[str, int]] = {}
    for line_number, line in section:
        if not line.startswith("|"):
            continue
        cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
        if header is None and "Status" in cells:
            header = cells
            status_index = cells.index("Status")
            continue
        if header is None or status_index is None or len(cells) <= status_index:
            continue
        for identifier in _AF_ID.findall(line):
            rows[identifier] = (cells[status_index], line_number)
    return rows


def _parse_baseline(path: Path) -> _BaselineEvidence:
    """Extract Watch, Verified, trigger, and campaign-queue AF evidence."""
    watch: dict[str, int] = {}
    verified: dict[str, int] = {}
    triggers: dict[str, int] = {}
    if path.is_file():
        in_trigger = False
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(),
            start=1,
        ):
            if line.strip() == "```watch-trigger":
                in_trigger = True
                continue
            if in_trigger and line.strip() == "```":
                in_trigger = False
                continue
            if in_trigger:
                match = re.match(r"\s*(AF-\d{3})\s*:", line)
                if match:
                    triggers.setdefault(match.group(1), line_number)
            for match in re.finditer(r"Watch\s+\((AF-\d{3})\)", line):
                watch.setdefault(match.group(1), line_number)
            for match in re.finditer(r"\b(AF-\d{3})\b[^|\n]{0,48}\bVerified\b", line):
                verified.setdefault(match.group(1), line_number)
    return _BaselineEvidence(watch, verified, triggers, _parse_campaign_queue(path))


def _roadmap_line(path: Path, subversion: str) -> int:
    """Return the roadmap table line for one sub-version."""
    if not path.is_file():
        return 1
    pattern = re.compile(rf"^\|\s*\**{re.escape(subversion)}\**\s*\|")
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if pattern.match(line):
            return line_number
    return 1


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


def _scratchpad_findings(root: Path) -> list[Finding]:
    """Warn when SCRATCHPAD Now omits the resolver-selected session."""
    state, errors = resolve(root)
    selected = state.get("session")
    if errors or not isinstance(selected, str):
        return []
    path = root / "docs/SCRATCHPAD.md"
    raw_path = _relative(root, path)
    if not path.is_file():
        return [Finding(raw_path, 1, "SCRATCHPAD is missing", "error")]
    now = _heading_section(path, "Now")
    named = {
        match.group(0)
        for _line_number, line in now
        if "**CURRENT" in line or "**NEXT" in line
        for match in _SESSION_ID.finditer(line)
    }
    if selected in named:
        return []
    return [
        Finding(
            raw_path,
            find_line(path, "## Now"),
            f"SCRATCHPAD Now does not name resolver-selected session {selected}",
            "warn",
        )
    ]


def _baseline_symmetry_findings(
    root: Path,
    path: Path,
    evidence: _BaselineEvidence,
) -> list[Finding]:
    """Require one Watch classification and one trigger for every Watch AF id."""
    raw_path = _relative(root, path)
    findings = [
        Finding(
            raw_path,
            evidence.watch[identifier],
            f"Watch classification {identifier} has no watch-trigger block",
            "error",
        )
        for identifier in sorted(set(evidence.watch) - set(evidence.triggers))
    ]
    findings.extend(
        Finding(
            raw_path,
            evidence.triggers[identifier],
            f"watch-trigger {identifier} has no Watch classification",
            "error",
        )
        for identifier in sorted(set(evidence.triggers) - set(evidence.watch))
    )
    return findings


def _finding_line(path: Path, finding: _AuditFinding) -> int:
    """Return the audit-ledger line for one finding id."""
    return find_line(path, f"| {finding.identifier} |")


def _audit_baseline_findings(
    root: Path,
    audit_path: Path,
    audit_findings: list[_AuditFinding],
    baseline_path: Path,
    evidence: _BaselineEvidence,
) -> list[Finding]:
    """Cross-check audit statuses against baseline Watch, Verified, and queue state."""
    findings: list[Finding] = []
    raw_audit = _relative(root, audit_path)
    raw_baseline = _relative(root, baseline_path)
    by_id = {finding.identifier: finding for finding in audit_findings}

    for finding in audit_findings:
        identifier = finding.identifier
        if finding.status == "watch" and identifier not in evidence.watch:
            findings.append(
                Finding(
                    raw_audit,
                    _finding_line(audit_path, finding),
                    f"audit ledger says {identifier} is Watch but baseline does not",
                    "error",
                )
            )
        if finding.status == "verified":
            carrier_line = (
                evidence.watch.get(identifier)
                or evidence.triggers.get(identifier)
                or (evidence.queue.get(identifier) or ("", 0))[1]
            )
            if carrier_line:
                findings.append(
                    Finding(
                        raw_baseline,
                        carrier_line,
                        f"audit ledger says {identifier} is Verified but baseline still carries active evidence",
                        "error",
                    )
                )
        elif identifier in evidence.verified:
            findings.append(
                Finding(
                    raw_baseline,
                    evidence.verified[identifier],
                    f"baseline says {identifier} is Verified but audit ledger says {finding.status.title()}",
                    "error",
                )
            )

    for identifier, (queue_status, line_number) in evidence.queue.items():
        finding = by_id.get(identifier)
        if finding is None:
            findings.append(
                Finding(
                    raw_baseline,
                    line_number,
                    f"campaign queue names {identifier} without a live audit finding",
                    "error",
                )
            )
        elif queue_status.casefold() != finding.status:
            findings.append(
                Finding(
                    raw_baseline,
                    line_number,
                    f"campaign queue says {identifier} is {queue_status} but audit ledger says {finding.status.title()}",
                    "error",
                )
            )
    return findings


def _roadmap_finding_rows(
    roadmap: Path,
    rows: list[_RoadmapRow],
    audit_findings: list[_AuditFinding],
) -> dict[str, list[_RoadmapRow]]:
    """Map audit ids to roadmap rows by remediation id or an explicit row citation."""
    by_subversion = {row.subversion: row for row in rows}
    mapped: dict[str, list[_RoadmapRow]] = {}
    for finding in audit_findings:
        row = by_subversion.get(finding.remediation)
        if row is not None:
            mapped.setdefault(finding.identifier, []).append(row)
    if roadmap.is_file():
        for line in roadmap.read_text(encoding="utf-8").splitlines():
            if not line.startswith("|"):
                continue
            cells = [cell.strip().strip("*") for cell in line.strip().strip("|").split("|")]
            if not cells:
                continue
            row = by_subversion.get(cells[0])
            if row is None:
                continue
            for identifier in _AF_ID.findall(line):
                bucket = mapped.setdefault(identifier, [])
                if row not in bucket:
                    bucket.append(row)
    return mapped


def _audit_roadmap_findings(
    root: Path,
    roadmap: Path,
    rows: list[_RoadmapRow],
    audit_path: Path,
    audit_findings: list[_AuditFinding],
) -> list[Finding]:
    """Cross-check actionable audit status against mapped remediation delivery."""
    findings: list[Finding] = []
    mapped = _roadmap_finding_rows(roadmap, rows, audit_findings)
    raw_roadmap = _relative(root, roadmap)
    for finding in audit_findings:
        for row in mapped.get(finding.identifier, []):
            if row.terminal and finding.status == "open":
                findings.append(
                    Finding(
                        raw_roadmap,
                        _roadmap_line(roadmap, row.subversion),
                        f"roadmap {row.subversion} is {row.status} while {finding.identifier} remains Open",
                        "error",
                    )
                )
            if not row.terminal and finding.status in {"delivered", "verified"}:
                findings.append(
                    Finding(
                        _relative(root, audit_path),
                        _finding_line(audit_path, finding),
                        f"audit ledger says {finding.identifier} is {finding.status.title()} while roadmap {row.subversion} is {row.status}",
                        "warn",
                    )
                )
    return findings


def collect_findings(root: Path) -> list[Finding]:
    """Collect every cross-artifact contradiction and snapshot-timing warning."""
    roadmap, version, rows, roadmap_errors = _active_roadmap(root)
    if roadmap is None or version is None:
        return [
            Finding("docs", 1, error, "error")
            for error in roadmap_errors
        ]

    contract_index = root / "docs/session-contracts" / version / "INDEX.md"
    baseline_path = root / "docs/CODE_HEALTH_BASELINE.md"
    findings = _execution_evidence_findings(root, roadmap, rows, contract_index)
    findings.extend(_scratchpad_findings(root))
    if not baseline_path.is_file():
        findings.append(
            Finding(
                _relative(root, baseline_path),
                1,
                "code-health baseline is missing",
                "error",
            )
        )
        return findings

    evidence = _parse_baseline(baseline_path)
    findings.extend(_baseline_symmetry_findings(root, baseline_path, evidence))

    audit_path = root / "docs/version-audits" / version / "PLAN.md"
    if audit_path.is_file():
        audit_findings, audit_errors = parse_audit_findings(audit_path)
        findings.extend(
            Finding(_relative(root, audit_path), 1, error, "error")
            for error in audit_errors
        )
        findings.extend(
            _audit_baseline_findings(
                root,
                audit_path,
                audit_findings,
                baseline_path,
                evidence,
            )
        )
        findings.extend(
            _audit_roadmap_findings(root, roadmap, rows, audit_path, audit_findings)
        )
    return findings


def main() -> int:
    """Run the lifecycle-evidence checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
