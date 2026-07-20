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
CONTRACT_SCHEMA_RELPATH = "docs/workflows/schema/session-contract.md"
PLAN_SCHEMA_RELPATH = "docs/workflows/schema/session-plan.md"
POLICY_MANIFEST_RELPATH = ".agent-local/policy-manifest.json"
RELEASE_CONSISTENCY_GATE = "python3 .agent-local/check_release_consistency.py --check"
TERMINAL = ("SHIPPED", "COMPLETE", "DEFERRED", "CANCELLED")
# Closed, case-sensitive marker vocabularies owned by the canonical schemas.
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
CONTRACT_ID_SECTIONS = {
    "DEP": "Current context and dependencies",
    "DC": "Done conditions",
    "IS": "In scope",
    "OOS": "Out of scope",
    "HC": "Hard constraints",
    "PD": "Decisions the session plan must resolve",
    "AC": "Acceptance criteria",
    "V": "Verification",
    "G": "UX/operator gates",
}
PLAN_ID_SECTIONS = {
    "DEP": "Current state and prerequisites",
    "IS": "Scope (the destination)",
    "OOS": "Scope (the destination)",
    "PD": "Resolved implementation decisions",
    "DC": "Success criteria (agent-runnable — show the output)",
    "AC": "Success criteria (agent-runnable — show the output)",
    "V": "Success criteria (agent-runnable — show the output)",
    "G": "Success criteria (agent-runnable — show the output)",
}


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
            "preDispatchGate": RELEASE_CONSISTENCY_GATE if self.handler is not None else None,
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


def schema_headings(path: Path, level: int) -> list[str] | None:
    """Return one schema's ordered headings, or None when its form is unusable."""
    if not path.is_file():
        return None
    headings = re.findall(rf"^{'#' * level} (.+?)\s*$", path.read_text(encoding="utf-8"), re.MULTILINE)
    if not headings or len(headings) != len(set(headings)):
        return None
    return headings


def required_contract_sections(root: Path) -> list[str] | None:
    """Return the schema-derived numbered contract titles, or None when unusable."""
    path = root / CONTRACT_SCHEMA_RELPATH
    if not path.is_file():
        return None
    parsed = [
        (int(number), title.strip())
        for number, title in re.findall(
            r"^## (\d+)\. (.+?)\s*$",
            path.read_text(encoding="utf-8"),
            re.MULTILINE,
        )
    ]
    if not parsed:
        return None
    numbers = [number for number, _ in parsed]
    titles = [title for _, title in parsed]
    if numbers != list(range(1, len(parsed) + 1)) or len(titles) != len(set(titles)):
        return None
    return titles


def contract_section_titles(contract: Path) -> list[str]:
    """Return ordered numbered titles, preserving missing-file error ownership."""
    if not contract.is_file():
        return []
    return [
        title.strip()
        for _, title in re.findall(
            r"^## (\d+)\. (.+?)\s*$",
            contract.read_text(encoding="utf-8"),
            re.MULTILINE,
        )
    ]


def section_bodies(path: Path, level: int) -> dict[str, str]:
    """Split a Markdown artifact into bodies owned by one heading level."""
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(rf"^{'#' * level} (.+?)\s*$", re.MULTILINE)
    matches = list(pattern.finditer(text))
    return {
        match.group(1).strip(): text[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(text)].strip()
        for index, match in enumerate(matches)
    }


def legacy_schema_artifacts(root: Path) -> set[str]:
    """Return exact repository-relative artifacts grandfathered by policy."""
    path = root / POLICY_MANIFEST_RELPATH
    if not path.is_file():
        return set()
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    values = manifest.get("developmentState", {}).get("legacySchemaArtifacts", [])
    return {value for value in values if isinstance(value, str)} if isinstance(values, list) else set()


def schema_allowlisted(path: Path, root: Path) -> bool:
    try:
        relative = str(path.relative_to(root))
    except ValueError:
        return False
    return relative in legacy_schema_artifacts(root)


def contract_item_ids(path: Path) -> dict[str, list[str]]:
    """Return schema-owned item definitions found in their canonical sections."""
    bodies = section_bodies(path, 2)
    definitions: dict[str, list[str]] = {}
    for prefix, title in CONTRACT_ID_SECTIONS.items():
        body = bodies.get(next((heading for heading in bodies if heading.endswith(f". {title}")), ""), "")
        definitions[prefix] = re.findall(
            rf"^\s*-\s+\*\*({prefix}-\d+)(?:\s*[:—])",
            body,
            re.MULTILINE,
        )
    return definitions


def contract_schema_violations(path: Path, root: Path) -> list[str]:
    """Return structural and reference violations for a non-legacy contract."""
    required = required_contract_sections(root)
    if required is None:
        return [f"canonical contract schema is unusable: {CONTRACT_SCHEMA_RELPATH}"]
    titles = contract_section_titles(path)
    expected = required
    violations: list[str] = []
    text = path.read_text(encoding="utf-8")
    first = next((line for line in text.splitlines() if line.strip()), "")
    if not first.startswith(f"## Session {path.stem} — "):
        violations.append(f"first heading must identify Session {path.stem}")
    subversion = marker(path, "Sub-version")
    if subversion is None or not re.match(r"\d+\.\d+\.\d+(?:\.\d+)*\b", subversion):
        violations.append("Sub-version marker is missing or invalid")
    master_plan = marker(path, "Master plan")
    if master_plan is None or not re.match(r"docs/VERSION_\d+_\d+_PLAN\.md`?\s+§\d+\.\d+\.\d+", master_plan):
        violations.append("Master plan marker is missing or invalid")
    if marker(path, "UX gate") not in MARKER_VOCABULARY["UX gate"]:
        violations.append("UX gate must be Yes or No")
    numbered = [
        (int(number), title.strip())
        for number, title in re.findall(r"^## (\d+)\. (.+?)\s*$", text, re.MULTILINE)
    ]
    all_h2 = re.findall(r"^## (.+?)\s*$", text, re.MULTILINE)
    expected_h2 = [first.removeprefix("## ")] + [
        f"{number}. {title}" for number, title in enumerate(expected, start=1)
    ]
    if all_h2 != expected_h2 or [number for number, _ in numbered] != list(
        range(1, len(expected) + 1)
    ):
        violations.append(
            "contract headings must be the session heading plus canonical numbered sections only"
        )
    if titles != expected:
        missing = [title for title in expected if title not in titles]
        if missing:
            violations.append("missing required sections: " + ", ".join(missing))
        if not missing or titles != [title for title in expected if title in titles]:
            violations.append("numbered sections must appear exactly once in canonical order")
        return violations
    bodies = section_bodies(path, 2)
    for number, title in enumerate(expected, start=1):
        if not bodies.get(f"{number}. {title}", "").strip():
            violations.append(f"section {number}. {title} is empty")

    definitions = contract_item_ids(path)
    for prefix, identifiers in definitions.items():
        if prefix == "G" and not identifiers:
            continue
        expected_ids = [f"{prefix}-{number}" for number in range(1, len(identifiers) + 1)]
        if not identifiers:
            violations.append(f"{CONTRACT_ID_SECTIONS[prefix]} must define at least one {prefix}-N item")
        elif identifiers != expected_ids:
            violations.append(f"{prefix}-N definitions must be unique and contiguous from {prefix}-1")

    defined = {identifier for identifiers in definitions.values() for identifier in identifiers}
    referenced = set(re.findall(r"\b(?:DEP|DC|IS|OOS|HC|PD|AC|V|G)-\d+\b", text))
    unknown = sorted(referenced - defined)
    if unknown:
        violations.append("references undefined contract identifiers: " + ", ".join(unknown))
    acceptance_body = bodies.get("8. Acceptance criteria", "")
    for acceptance in definitions["AC"]:
        item = re.search(
            rf"^\s*-\s+\*\*{re.escape(acceptance)}(?:\s*[:—])([\s\S]*?)(?=^\s*-\s+\*\*AC-\d+(?:\s*[:—])|\Z)",
            acceptance_body,
            re.MULTILINE,
        )
        if item is None or not re.search(r"\bDC-\d+\b", item.group(1)):
            violations.append(f"{acceptance} must name the DC-N condition it proves")
    for done in definitions["DC"]:
        if done not in acceptance_body:
            violations.append(f"{done} is not proved by any AC-N item")
    if re.search(r"\b(?:TBD|TODO|FIXME)\b|\bX\.Y\.N\b", text, re.IGNORECASE):
        violations.append("contract contains a placeholder token")
    return violations


def plan_schema_violations(path: Path, contract: Path, root: Path) -> list[str]:
    """Return machine-verifiable plan-form and contract-coverage violations."""
    schema = root / PLAN_SCHEMA_RELPATH
    required_h2 = schema_headings(schema, 2)
    required_h3 = schema_headings(schema, 3)
    if required_h2 is None or required_h3 is None:
        return [f"canonical session-plan schema is unusable: {PLAN_SCHEMA_RELPATH}"]
    text = path.read_text(encoding="utf-8")
    actual_h2 = re.findall(r"^## (.+?)\s*$", text, re.MULTILINE)
    actual_h3 = re.findall(r"^### (.+?)\s*$", text, re.MULTILINE)
    violations: list[str] = []
    if actual_h2 != required_h2:
        violations.append("required ## sections must appear exactly once in canonical order")
    if actual_h3 != required_h3:
        violations.append("required ### subsections must appear exactly once in canonical order")
    bodies = section_bodies(path, 2)
    schema_bodies = section_bodies(schema, 2)
    for title in required_h2:
        expected_subsections = re.findall(r"^### (.+?)\s*$", schema_bodies.get(title, ""), re.MULTILINE)
        actual_subsections = re.findall(r"^### (.+?)\s*$", bodies.get(title, ""), re.MULTILINE)
        if actual_subsections != expected_subsections:
            violations.append(f"section {title!r} has misplaced or missing subsections")
    for title in required_h2:
        if not bodies.get(title, "").strip():
            violations.append(f"section {title!r} is empty")

    relative_contract = str(contract.relative_to(root))
    first = next((line for line in text.splitlines() if line.strip()), "")
    if not first.startswith(f"# Session {path.stem} Implementation Plan — "):
        violations.append(f"first heading must identify Session {path.stem} Implementation Plan")
    expected_markers = {
        "Plan status": "Approved",
        "Contract": relative_contract,
        "Contract digest": f"sha256:{sha256(contract)}",
        "Planning standard": PLAN_SCHEMA_RELPATH,
    }
    for label, expected_value in expected_markers.items():
        if marker(path, label) != expected_value:
            violations.append(f"{label} must be {expected_value!r}")
    approved = marker(path, "Approved")
    if approved is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", approved):
        violations.append("Approved must be a YYYY-MM-DD date")
    if marker(path, "Execution status") not in MARKER_VOCABULARY["Execution status"]:
        violations.append("Execution status must be Pending or Complete")
    baseline_effect = marker(path, "Baseline effect")
    if baseline_effect not in MARKER_VOCABULARY["Baseline effect"]:
        violations.append("Baseline effect has an invalid value")
    ux_gate = marker(contract, "UX gate")
    plan_ux_match = re.search(
        r"^\*\*Contract UX gate:\*\*\s+`?(Yes|No)`?\s+·\s+\*\*required pause:\*\*\s+\S",
        text,
        re.MULTILINE,
    )
    if plan_ux_match is None or plan_ux_match.group(1) != ux_gate:
        violations.append("Contract UX gate must match the contract marker")
    if not re.search(r"^\*\*Branch:\*\*\s+\S.+\*\*ends in PR:\*\*\s+(?:yes|no)\s+·\s+\*\*gate:\*\*\s+\S", text, re.MULTILINE | re.IGNORECASE):
        violations.append("Bottom line must contain the exact Branch / ends in PR / gate marker")
    if "<hard_constraints>" not in bodies.get("Bottom line (READ FIRST)", "") or "</hard_constraints>" not in bodies.get("Bottom line (READ FIRST)", ""):
        violations.append("Bottom line must contain the hard_constraints block")
    for label in ("GOAL:", "DONE =", "OUT OF SCOPE:"):
        if not re.search(rf"^\s*-\s+\*\*{re.escape(label)}\*\*\s+\S", bodies.get("Bottom line (READ FIRST)", ""), re.MULTILINE):
            violations.append(f"Bottom line must contain a non-empty {label} item")
    if re.search(r"\b(?:TBD|TODO|FIXME)\b|\bX\.Y\.N\b|\b(?:DEP|DC|IS|OOS|HC|PD|AC|V|G|SC)-N\b", text, re.IGNORECASE):
        violations.append("plan contains a placeholder token")

    definitions = contract_item_ids(contract)
    expected_locations = dict(PLAN_ID_SECTIONS)
    expected_locations["HC"] = "Bottom line (READ FIRST)"
    for prefix, identifiers in definitions.items():
        location = expected_locations[prefix]
        body = bodies.get(location, "")
        for identifier in identifiers:
            if identifier not in body:
                violations.append(f"{identifier} is missing from {location}")
    defined = {identifier for identifiers in definitions.values() for identifier in identifiers}
    referenced = set(re.findall(r"\b(?:DEP|DC|IS|OOS|HC|PD|AC|V|G)-\d+\b", text))
    unknown = sorted(referenced - defined)
    if unknown:
        violations.append("plan references undefined contract identifiers: " + ", ".join(unknown))

    prerequisites = bodies.get("Current state and prerequisites", "")
    for dependency in definitions["DEP"]:
        if not re.search(rf"^\|\s*`?{re.escape(dependency)}`?\s*\|\s*`?Verified`?\s*\|", prerequisites, re.MULTILINE):
            violations.append(f"{dependency} must have a Verified prerequisite row")
    if re.search(r"\|\s*`?Blocking`?\s*\|", prerequisites):
        violations.append("an approved plan cannot contain a Blocking prerequisite")

    success = bodies.get("Success criteria (agent-runnable — show the output)", "")
    success_ids = re.findall(r"^\s*-\s+\*\*(SC-\d+)\s+—", success, re.MULTILINE)
    expected_success = [f"SC-{number}" for number in range(1, len(success_ids) + 1)]
    if not success_ids or success_ids != expected_success:
        violations.append("SC-N criteria must be unique and contiguous from SC-1")
    for success_id in success_ids:
        match = re.search(
            rf"^\s*-\s+\*\*{re.escape(success_id)}\s+—([\s\S]*?)(?=^\s*-\s+\*\*SC-\d+\s+—|\Z)",
            success,
            re.MULTILINE,
        )
        if match is None or "`" not in match.group(1) or "→" not in match.group(1):
            violations.append(f"{success_id} must pair a runnable command or inspection with exact output")
    bottom = bodies.get("Bottom line (READ FIRST)", "")
    if success_ids:
        explicit = all(identifier in bottom for identifier in success_ids)
        ranged = f"SC-1 through {success_ids[-1]}" in bottom
        if not explicit and not ranged:
            violations.append("DONE must reference every SC-N criterion")
    if baseline_effect and not re.search(rf"\*\*Effect:\*\*\s+`?{re.escape(baseline_effect)}`?\b", bodies.get("Design pressure and baseline effect", "")):
        violations.append("Baseline effect body must match the header marker")
    end = bodies.get("End of session", "")
    for label in ("Delivery", "Lifecycle artifacts", "Handoff"):
        if not re.search(rf"^\s*-\s+\*\*{re.escape(label)}:\*\*\s+\S", end, re.MULTILINE):
            violations.append(f"End of session must contain a non-empty {label} item")
    return violations


def vocabulary_binds(version: str) -> bool:
    """Return whether active artifacts must satisfy the 3.9 marker schema."""
    major, minor = (int(part) for part in version.split(".", maxsplit=1))
    return (major, minor) >= (3, 9)


def workflow_schema_binds(version: str) -> bool:
    """Return whether the canonical contract and plan forms are mandatory."""
    major, minor = (int(part) for part in version.split(".", maxsplit=1))
    return (major, minor) >= (3, 10)


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
    if workflow_schema_binds(version) and not schema_allowlisted(path, root):
        violations = plan_schema_violations(path, contract, root)
        if violations:
            return False, "The session plan does not conform to the canonical schema.", violations
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
        if not contract.is_file():
            return invalid_state(
                common,
                f"contract index entry {session} points to missing {contract.relative_to(root)}",
                errors,
            )
        if (
            workflow_schema_binds(version)
            and not schema_allowlisted(contract, root)
            and required_contract_sections(root) is None
        ):
            return invalid_state(
                common,
                f"The canonical contract schema is missing or unusable: {CONTRACT_SCHEMA_RELPATH}",
                errors,
            )
        if workflow_schema_binds(version) and not schema_allowlisted(contract, root):
            violations = contract_schema_violations(contract, root)
            if violations:
                required = required_contract_sections(root) or []
                actual = contract_section_titles(contract)
                missing = [title for title in required if title not in actual]
                return {
                    **common,
                    "stage": "contract-repair-needed",
                    "subversion": incomplete.subversion,
                    "session": session,
                    "contract": str(contract.relative_to(root)),
                    "missingContractSections": missing,
                    "contractSchemaViolations": violations,
                    "reason": "The selected contract does not conform to the canonical schema.",
                }, errors
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
    if stage == "contract-repair-needed":
        violations = "; ".join(str(item) for item in state.get("contractSchemaViolations", []))
        return WorkflowDirective(
            action=f"Repair contract {state['contract']} to the canonical schema: {violations}",
            handler=None,
            mode="report",
            authority="Limited to restoring the named contract's required schema on the active branch.",
            primary_artifact=str(state["contract"]),
            pause="Contract repair is required before the session can be planned or executed.",
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
