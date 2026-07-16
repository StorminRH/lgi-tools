#!/usr/bin/env python3
"""Resolve the current LGI.tools document-driven development stage."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parents[1]
TERMINAL = ("SHIPPED", "COMPLETE", "DEFERRED", "CANCELLED")
# Closed, case-sensitive marker vocabularies owned by docs/SESSION_CONTRACTS.md.
# Binding-era artifacts report any other present value with its file and value.
MARKER_VOCABULARY = {
    "Execution status": ("Pending", "Complete"),
    "Baseline effect": ("Improves", "Neutral", "Temporary pressure"),
    "UX gate": ("Yes", "No"),
}
AUDIT_STATUSES = {
    "approved",
    "remediation required",
    "remediation in progress",
    "complete",
}
FINDING_CLASSES = {"floss", "campaign", "watch"}
FINDING_STATUSES = {"open", "planned", "delivered", "verified", "watch"}


@dataclass(frozen=True)
class RoadmapRow:
    subversion: str
    status: str

    @property
    def terminal(self) -> bool:
        """Return whether the stripped status is one exact terminal token."""
        return self.status.upper() in TERMINAL


@dataclass(frozen=True)
class AuditFinding:
    identifier: str
    first_seen: int
    classification: str
    remediation: str
    status: str

    @property
    def actionable(self) -> bool:
        return self.classification in {"floss", "campaign"}


@dataclass(frozen=True)
class WorkflowDirective:
    action: str
    handler: str | None
    mode: str
    authority: str
    primary_artifact: str | None
    pause: str

    def as_dict(self, reason: str) -> dict[str, str | None]:
        return {
            "action": self.action,
            "reason": reason,
            "handler": self.handler,
            "mode": self.mode,
            "authority": self.authority,
            "primaryArtifact": self.primary_artifact,
            "pause": self.pause,
        }


def version_from_path(path: Path) -> str | None:
    match = re.fullmatch(r"VERSION_(\d+)_(\d+)_PLAN\.md", path.name)
    if not match:
        return None
    return f"{match.group(1)}.{match.group(2)}"


def ambiguous_status(status: str) -> bool:
    """Return whether a nonterminal roadmap status embeds a terminal token."""
    upper = status.upper()
    return upper not in TERMINAL and any(word in upper for word in TERMINAL)


def parse_status_rows(path: Path) -> list[RoadmapRow]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"^## Status\s*$([\s\S]*?)(?=^## |\Z)", text, re.MULTILINE)
    if not match:
        return []

    rows: list[RoadmapRow] = []
    for line in match.group(1).splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip().strip("*") for cell in line.strip().strip("|").split("|")]
        if len(cells) < 2 or cells[0] in {"Sub-version", "---"}:
            continue
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)*", cells[0]):
            continue
        rows.append(RoadmapRow(cells[0], cells[-1]))
    return rows


def active_roadmap(root: Path) -> tuple[Path | None, str | None, list[RoadmapRow], list[str]]:
    docs = root / "docs"
    errors: list[str] = []
    candidates: list[tuple[Path, str, list[RoadmapRow]]] = []
    complete: list[tuple[Path, str, list[RoadmapRow]]] = []

    for path in sorted(docs.glob("VERSION_*_PLAN.md")):
        version = version_from_path(path)
        if not version:
            continue
        rows = parse_status_rows(path)
        if not rows:
            errors.append(f"{path.relative_to(root)}: missing parseable ## Status rows")
            continue
        for row in rows:
            if ambiguous_status(row.status):
                errors.append(
                    f"{path.relative_to(root)}: ambiguous roadmap status {row.status!r}"
                )
        target = complete if all(row.terminal for row in rows) else candidates
        target.append((path, version, rows))

    if candidates and complete:
        active_names = ", ".join(str(item[0].relative_to(root)) for item in candidates)
        complete_names = ", ".join(str(item[0].relative_to(root)) for item in complete)
        errors.append(
            "an incomplete master plan exists before completed version artifacts "
            f"were archived: active={active_names}; completed={complete_names}"
        )
        return None, None, [], errors
    if len(candidates) > 1:
        names = ", ".join(str(item[0].relative_to(root)) for item in candidates)
        errors.append(f"multiple active master plans: {names}")
        return None, None, [], errors
    if candidates:
        return *candidates[0], errors
    if len(complete) == 1:
        return *complete[0], errors
    if len(complete) > 1:
        names = ", ".join(str(item[0].relative_to(root)) for item in complete)
        errors.append(f"multiple completed unarchived master plans: {names}")
    return None, None, [], errors


def parse_contract_index(path: Path) -> dict[str, tuple[str, Path]]:
    entries: dict[str, tuple[str, Path]] = {}
    if not path.is_file():
        return entries
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
        if len(cells) != 3 or not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)+", cells[0]):
            continue
        entries[cells[0]] = (cells[1], path.parent / cells[2])
    return entries


def marker(path: Path, label: str) -> str | None:
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"\*\*{re.escape(label)}:\*\*\s+(.+?)\s*$", text, re.I | re.M)
    return match.group(1).strip().strip("`") if match else None


def vocabulary_binds(version: str) -> bool:
    """Return whether active artifacts must satisfy the 3.9 marker schema."""
    major, minor = (int(part) for part in version.split(".", maxsplit=1))
    return (major, minor) >= (3, 9)


def marker_value_error(
    path: Path,
    root: Path,
    label: str,
    value: str,
) -> str | None:
    """Return a file-and-value error when a present marker is invalid."""
    if value in MARKER_VOCABULARY[label]:
        return None
    return f"{path.relative_to(root)}: invalid {label} value {value!r}"


def table_field(path: Path, label: str) -> str | None:
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[0].casefold() == label.casefold():
            return cells[1]
    return None


def status_is(path: Path, label: str, expected: str) -> bool:
    value = marker(path, f"{label} status")
    return value is not None and value.casefold() == expected.casefold()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def execution_complete(path: Path) -> bool:
    return status_is(path, "Execution", "Complete")


def approved_session_plan(
    path: Path,
    contract: Path,
    version: str,
    root: Path,
) -> tuple[bool, str, list[str]]:
    """Validate plan approval, contract identity, and binding marker schema.

    Missing required markers return a planning reason; present invalid values
    additionally return file-and-value errors for the resolver payload.
    """
    if not path.is_file():
        return False, "The next contract has no session plan.", []
    if not status_is(path, "Plan", "Approved"):
        return False, "The next session plan is not approved.", []
    digest = marker(path, "Contract digest")
    expected = f"sha256:{sha256(contract)}"
    if digest != expected:
        return (
            False,
            "The session plan is stale because its contract digest does not match.",
            [],
        )
    if vocabulary_binds(version):
        values = {
            "Execution status": marker(path, "Execution status"),
            "Baseline effect": marker(path, "Baseline effect"),
        }
        marker_errors = [
            error
            for label, value in values.items()
            if value is not None
            for error in [marker_value_error(path, root, label, value)]
            if error is not None
        ]
        if marker_errors:
            return False, "The session plan has invalid marker values.", marker_errors
        if values["Baseline effect"] is None:
            return False, "The session plan is missing its Baseline effect marker.", []
    return True, "The approved session plan matches the current contract.", []


def parse_audit_findings(path: Path) -> tuple[list[AuditFinding], list[str]]:
    findings: list[AuditFinding] = []
    errors: list[str] = []
    seen: set[str] = set()
    if not path.is_file():
        return findings, errors

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
        if len(cells) != 7 or not re.fullmatch(r"AF-\d{3}", cells[0]):
            continue
        identifier = cells[0]
        if identifier in seen:
            errors.append(f"duplicate audit finding id {identifier}")
            continue
        seen.add(identifier)
        try:
            first_seen = int(cells[1])
        except ValueError:
            errors.append(f"audit finding {identifier} has invalid First seen cycle {cells[1]!r}")
            continue
        classification = cells[2].casefold()
        remediation = cells[5]
        status = cells[6].casefold()
        if classification not in FINDING_CLASSES:
            errors.append(f"audit finding {identifier} has invalid class {cells[2]!r}")
            continue
        if status not in FINDING_STATUSES:
            errors.append(f"audit finding {identifier} has invalid status {cells[6]!r}")
            continue
        if classification == "watch" and status != "watch":
            errors.append(f"Watch finding {identifier} must have status Watch")
        if classification != "watch" and status == "watch":
            errors.append(f"actionable finding {identifier} cannot have status Watch")
        if status in {"planned", "delivered", "verified"} and remediation in {"", "—", "-"}:
            errors.append(f"audit finding {identifier} is {cells[6]} without mapped remediation")
        findings.append(AuditFinding(identifier, first_seen, classification, remediation, status))
    return findings, errors


def audit_contract(path: Path, root: Path) -> tuple[str | None, list[AuditFinding], list[str], str]:
    docs = root / "docs"
    errors: list[str] = []
    if not path.is_file():
        return None, [], errors, "No audit plan exists."
    if (marker(path, "Audit mode") or "").casefold() != "version close":
        return None, [], errors, "The audit plan is not a Version close plan."

    procedure = docs / "VERSION_AUDIT.md"
    expected = f"sha256:{sha256(procedure)}"
    if marker(path, "Procedure digest") != expected:
        return None, [], errors, "The audit plan is stale because its procedure digest does not match."

    status = (marker(path, "Audit status") or "").casefold()
    if status not in AUDIT_STATUSES:
        errors.append(f"{path.relative_to(root)}: invalid or missing Audit status")

    cycle = marker(path, "Audit cycle") or ""
    if not cycle.isdigit() or int(cycle) < 1:
        errors.append(f"{path.relative_to(root)}: Audit cycle must be a positive integer")
    audited_ref = marker(path, "Audited ref") or ""
    if not re.fullmatch(r"[0-9a-f]{40}", audited_ref):
        errors.append(f"{path.relative_to(root)}: Audited ref must be a full lowercase commit SHA")

    findings, finding_errors = parse_audit_findings(path)
    errors.extend(f"{path.relative_to(root)}: {error}" for error in finding_errors)
    return status or None, findings, errors, "The version-close audit state matches the current procedure."


def invalid_state(common: dict[str, object], reason: str, errors: list[str]) -> tuple[dict[str, object], list[str]]:
    errors.append(reason)
    return {**common, "stage": "invalid", "reason": reason}, errors


def resolve_state(root: Path = DEFAULT_ROOT) -> tuple[dict[str, object], list[str]]:
    root = root.resolve()
    docs = root / "docs"
    roadmap, version, rows, errors = active_roadmap(root)
    if roadmap is None or version is None:
        return {
            "stage": "master-plan-needed" if not errors else "invalid",
            "reason": "No single active or completed-unarchived master version plan was found.",
        }, errors

    contract_index = docs / "session-contracts" / version / "INDEX.md"
    contracts = parse_contract_index(contract_index)
    for session, (_, contract) in contracts.items():
        if not contract.is_file():
            errors.append(f"contract index entry {session} points to missing {contract.relative_to(root)}")

    common: dict[str, object] = {
        "activeVersion": version,
        "masterPlan": str(roadmap.relative_to(root)),
        "contractIndex": str(contract_index.relative_to(root)),
    }
    audit_plan = docs / "version-audits" / version / "PLAN.md"
    audit_status: str | None = None
    findings: list[AuditFinding] = []

    if audit_plan.is_file() and (marker(audit_plan, "Audit mode") or "").casefold() == "version close":
        common["auditPlan"] = str(audit_plan.relative_to(root))
        audit_status, findings, audit_errors, audit_reason = audit_contract(audit_plan, root)
        if audit_reason.startswith("The audit plan is stale"):
            return {
                **common,
                "stage": "audit-plan-needed",
                "auditPlan": str(audit_plan.relative_to(root)),
                "reason": audit_reason,
            }, errors
        errors.extend(audit_errors)
        if audit_errors:
            return invalid_state(common, "The version-close audit metadata or finding ledger is invalid.", errors)
        common["auditStatus"] = audit_status
        common["auditCycle"] = int(marker(audit_plan, "Audit cycle") or "0")

    open_actionable = [finding for finding in findings if finding.actionable and finding.status == "open"]
    unresolved_actionable = [finding for finding in findings if finding.actionable and finding.status != "verified"]

    if audit_status == "remediation in progress" and not unresolved_actionable:
        return invalid_state(
            common,
            "Remediation in progress requires at least one Planned or Delivered actionable finding.",
            errors,
        )

    incomplete = next((row for row in rows if not row.terminal), None)
    if incomplete:
        if audit_status == "remediation required":
            return invalid_state(
                common,
                "The roadmap contains remediation rows while the audit still says Remediation required.",
                errors,
            )
        if audit_status in {"approved", "complete"}:
            return invalid_state(
                common,
                f"The roadmap is nonterminal while the version-close audit status is {audit_status.title()}.",
                errors,
            )
        if audit_status == "remediation in progress" and open_actionable:
            return invalid_state(
                common,
                "Remediation in progress cannot retain open actionable findings; map them before execution.",
                errors,
            )

        sessions = sorted(
            (
                (session, contract)
                for session, (subversion, contract) in contracts.items()
                if subversion == incomplete.subversion
            ),
            key=lambda item: tuple(int(part) for part in item[0].split(".")),
        )
        if not contract_index.is_file() or not sessions:
            return {
                **common,
                "stage": "contracts-needed",
                "subversion": incomplete.subversion,
                "reason": "The next incomplete sub-version has no indexed session contract.",
            }, errors

        remaining = []
        for session, contract in sessions:
            plan = docs / "session-plans" / version / f"{session}.md"
            if execution_complete(plan):
                continue
            remaining.append((session, contract, plan))

        if not remaining:
            return invalid_state(
                common,
                f"{roadmap.relative_to(root)}: {incomplete.subversion} is nonterminal but every indexed session plan is complete",
                errors,
            )

        session, contract, plan = remaining[0]
        ux_gate: str | None = None
        if vocabulary_binds(version):
            ux_gate = marker(contract, "UX gate")
            if ux_gate is None:
                return {
                    **common,
                    "stage": "session-plan-needed",
                    "subversion": incomplete.subversion,
                    "session": session,
                    "contract": str(contract.relative_to(root)),
                    "sessionPlan": str(plan.relative_to(root)),
                    "reason": "The contract is missing its UX gate marker.",
                }, errors
            ux_error = marker_value_error(contract, root, "UX gate", ux_gate)
            if ux_error:
                errors.append(ux_error)
                return {
                    **common,
                    "stage": "session-plan-needed",
                    "subversion": incomplete.subversion,
                    "session": session,
                    "contract": str(contract.relative_to(root)),
                    "sessionPlan": str(plan.relative_to(root)),
                    "reason": "The contract has an invalid UX gate marker.",
                }, errors

        plan_ready, plan_reason, plan_errors = approved_session_plan(
            plan,
            contract,
            version,
            root,
        )
        errors.extend(plan_errors)
        if not plan_ready:
            return {
                **common,
                "stage": "session-plan-needed",
                "subversion": incomplete.subversion,
                "session": session,
                "contract": str(contract.relative_to(root)),
                "sessionPlan": str(plan.relative_to(root)),
                "reason": plan_reason,
            }, errors
        return {
            **common,
            "stage": "session-ready",
            "subversion": incomplete.subversion,
            "session": session,
            "contract": str(contract.relative_to(root)),
            "sessionPlan": str(plan.relative_to(root)),
            "uxGate": ux_gate,
            "reason": plan_reason,
        }, errors

    if not audit_plan.is_file() or audit_status is None:
        return {
            **common,
            "stage": "audit-plan-needed",
            "auditPlan": str(audit_plan.relative_to(root)),
            "reason": "All roadmap rows are terminal and no current approved version-close audit exists.",
        }, errors

    if audit_status == "approved":
        if open_actionable:
            return invalid_state(
                common,
                "An Approved audit cannot retain open actionable findings; mark Remediation required.",
                errors,
            )
        return {
            **common,
            "stage": "audit-ready",
            "auditPlan": str(audit_plan.relative_to(root)),
            "reason": "The approved version-close audit is ready to run or resume.",
        }, errors

    if audit_status == "remediation required":
        if not open_actionable:
            return invalid_state(
                common,
                "Remediation required must identify at least one open Floss or Campaign finding.",
                errors,
            )
        return {
            **common,
            "stage": "audit-remediation-plan-needed",
            "auditPlan": str(audit_plan.relative_to(root)),
            "reason": "The audit found actionable work that must extend the current version before archival.",
        }, errors

    if audit_status == "remediation in progress":
        not_delivered = [finding for finding in unresolved_actionable if finding.status != "delivered"]
        if not_delivered:
            identifiers = ", ".join(finding.identifier for finding in not_delivered)
            return invalid_state(
                common,
                f"The remediation roadmap is terminal but findings are not Delivered: {identifiers}.",
                errors,
            )
        return {
            **common,
            "stage": "audit-restart-ready",
            "auditPlan": str(audit_plan.relative_to(root)),
            "reason": "All mapped remediation is delivered; restart the full audit against current main.",
        }, errors

    if audit_status == "complete":
        if unresolved_actionable:
            identifiers = ", ".join(finding.identifier for finding in unresolved_actionable)
            return invalid_state(
                common,
                f"A Complete audit has unresolved actionable findings: {identifiers}.",
                errors,
            )
        audited_ref = marker(audit_plan, "Audited ref")
        baseline_ref = table_field(docs / "CODE_HEALTH_BASELINE.md", "Code ref")
        if baseline_ref != audited_ref:
            return invalid_state(
                common,
                "A Complete audit requires CODE_HEALTH_BASELINE.md to match the Audited ref.",
                errors,
            )
        return {
            **common,
            "stage": "archive-needed",
            "auditPlan": str(audit_plan.relative_to(root)),
            "reason": "The clean version-close audit is complete and the active version bundle must be archived.",
        }, errors

    return invalid_state(common, "The version-close audit status is not recognized.", errors)


def directive_for(state: dict[str, object]) -> WorkflowDirective:
    stage = str(state["stage"])
    version = str(state.get("activeVersion", "the active version"))
    session = str(state.get("session", "the selected session"))

    if stage == "master-plan-needed":
        return WorkflowDirective(
            action="Request product direction for the next master version",
            handler=None,
            mode="report",
            authority="Read-only; no product scope may be invented.",
            primary_artifact=None,
            pause="Product direction is required.",
        )
    if stage == "contracts-needed":
        return WorkflowDirective(
            action=f"Plan session contracts for {state['subversion']}",
            handler="plan-version",
            mode="plan",
            authority="Read-only until the contract decomposition is approved.",
            primary_artifact=str(state["masterPlan"]),
            pause="Contract decomposition approval is required.",
        )
    if stage == "session-plan-needed":
        return WorkflowDirective(
            action=f"Plan session {session}",
            handler="plan-session",
            mode="plan",
            authority="Read-only until the session implementation plan is approved.",
            primary_artifact=str(state["contract"]),
            pause="Session-plan approval is required.",
        )
    if stage == "session-ready":
        pause = "Pause on a material scope/design conflict or an explicit operator gate."
        if state.get("uxGate") == "Yes":
            pause = (
                "UX gate: Ryan's local browser review is required before the PR opens; "
                "also pause on any material scope/design conflict."
            )
        return WorkflowDirective(
            action=f"Execute approved session {session}",
            handler="start-session",
            mode="execute",
            authority="Changes are limited to the approved session plan and contract.",
            primary_artifact=str(state["sessionPlan"]),
            pause=pause,
        )
    if stage == "audit-plan-needed":
        return WorkflowDirective(
            action=f"Plan the version-close audit for {version}",
            handler="plan-version-audit",
            mode="plan",
            authority="Read-only until the version-audit plan is approved.",
            primary_artifact=str(state["auditPlan"]),
            pause="Version-audit-plan approval is required.",
        )
    if stage == "audit-ready":
        return WorkflowDirective(
            action=f"Run or resume audit cycle {state['auditCycle']} for {version}",
            handler="version-audit",
            mode="execute",
            authority="Only approved audit-local changes are authorized; no merge or deployment is authorized.",
            primary_artifact=str(state["auditPlan"]),
            pause="Pause on actionable findings, a failed gate, or new external authority.",
        )
    if stage == "audit-remediation-plan-needed":
        return WorkflowDirective(
            action=f"Plan audit remediation for {version}",
            handler="plan-audit-remediation",
            mode="plan",
            authority="Read-only until the remediation extension and contracts are approved.",
            primary_artifact=str(state["auditPlan"]),
            pause="Audit-remediation approval is required.",
        )
    if stage == "audit-restart-ready":
        next_cycle = int(state["auditCycle"]) + 1
        return WorkflowDirective(
            action=f"Restart the complete version audit as cycle {next_cycle} for {version}",
            handler="version-audit",
            mode="execute",
            authority="Only the approved full-audit restart and audit-local changes are authorized.",
            primary_artifact=str(state["auditPlan"]),
            pause="Pause on actionable findings, a failed gate, or new external authority.",
        )
    if stage == "archive-needed":
        return WorkflowDirective(
            action=f"Archive the verified version {version} bundle",
            handler="version-audit",
            mode="execute",
            authority="Only the verified archive transition is authorized.",
            primary_artifact=str(state["auditPlan"]),
            pause="Pause if any archive precondition no longer holds.",
        )
    if stage == "invalid":
        return WorkflowDirective(
            action="Resolve the workflow contradiction",
            handler=None,
            mode="report",
            authority="Read-only until the contradiction is resolved.",
            primary_artifact=str(state["masterPlan"]) if "masterPlan" in state else None,
            pause="Maintainer direction is required.",
        )
    raise ValueError(f"unsupported workflow stage: {stage}")


def git_warnings(root: Path, state: dict[str, object]) -> list[str]:
    """Return non-blocking warnings from the current local git snapshot.

    Execute directives check branch naming, plan directives check worktree
    cleanliness, and every state checks whether local main trails the existing
    origin/main ref. Missing git state degrades to no warning and never changes
    the resolved lifecycle stage.
    """

    def git(*args: str) -> str | None:
        try:
            result = subprocess.run(
                ["git", "-C", str(root), *args],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
        except OSError:
            return None
        return result.stdout.strip() if result.returncode == 0 else None

    if git("rev-parse", "--is-inside-work-tree") != "true":
        return []

    warnings: list[str] = []
    directive = state.get("directive")
    mode = directive.get("mode") if isinstance(directive, dict) else None
    branch = git("symbolic-ref", "--quiet", "--short", "HEAD")
    subversion = state.get("subversion")

    if mode == "execute" and branch and isinstance(subversion, str):
        if branch == "main":
            warnings.append(
                f"current branch is main; create the {subversion} sub-version branch"
            )
        elif not branch.startswith("codex/"):
            expected = (
                rf"^[a-z][a-z0-9-]*/{re.escape(subversion)}"
                rf"(?:\.\d+)?-[a-z0-9-]+$"
            )
            if not re.fullmatch(expected, branch):
                warnings.append(
                    f"current branch {branch!r} does not embed sub-version {subversion}"
                )

    if mode == "plan":
        worktree = git("status", "--porcelain")
        if worktree:
            warnings.append("plan-mode directive has a dirty worktree")

    local_main = git("rev-parse", "--verify", "refs/heads/main")
    origin_main = git("rev-parse", "--verify", "refs/remotes/origin/main")
    if local_main and origin_main and local_main != origin_main:
        behind_count = git(
            "rev-list",
            "--count",
            "refs/heads/main..refs/remotes/origin/main",
        )
        if behind_count and behind_count.isdigit() and int(behind_count) > 0:
            warnings.append(f"local main is behind origin/main by {behind_count} commit(s)")

    return warnings


def resolve(root: Path = DEFAULT_ROOT) -> tuple[dict[str, object], list[str]]:
    state, errors = resolve_state(root)
    directive = directive_for(state).as_dict(str(state["reason"]))
    # UX gate is directive input, not a new top-level payload field; keeping it
    # internal preserves the frozen default resolver output for UX gate: No.
    public_state = {key: value for key, value in state.items() if key != "uxGate"}
    return {**public_state, "directive": directive}, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate lifecycle documents and exit nonzero on contradictions.")
    parser.add_argument(
        "--git",
        action="store_true",
        help="Add advisory warnings from the current local git snapshot.",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Repository root (used by fixture tests).")
    args = parser.parse_args()

    state, errors = resolve(args.root)
    warnings = git_warnings(args.root.resolve(), state) if args.git else []
    if args.check:
        for warning in warnings:
            print(f"workflow state warning: {warning}")
        if errors:
            for error in errors:
                print(f"workflow state error: {error}")
            return 1
        print(f"workflow state valid: {state['stage']}")
        return 0

    payload = {**state, "errors": errors}
    if args.git:
        payload["warnings"] = warnings
    print(json.dumps(payload, indent=2 if args.pretty else None, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
