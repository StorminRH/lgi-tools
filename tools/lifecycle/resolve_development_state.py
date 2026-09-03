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


from tools._lib.repository import ROOT
from tools.lifecycle.count_app_facing import (
    PROMOTE_BAR,
    PROMOTE_TRIGGER,
    try_app_facing_count,
)

DEFAULT_ROOT = ROOT
CONTRACT_SCHEMA_RELPATH = "docs/workflows/schema/session-contract.md"
PLAN_SCHEMA_RELPATH = "docs/workflows/schema/session-plan.md"
AS_BUILT_SCHEMA_RELPATH = "docs/workflows/schema/session-as-built.md"
# Sessions in sub-versions at or above this floor require an as-built record
# once their plan is Complete; earlier sessions predate the record species.
AS_BUILT_BINDING_FLOOR = (3, 10, 2, 1)
# Plans from this session onward use atomic proof rows. The immediately prior
# approved plan remains a frozen legacy prompt.
ATOMIC_PLAN_BINDING_FLOOR = (4, 0, 2, 2, 2)
# As-built records from this session onward carry criterion and review receipts.
EXECUTION_RECEIPT_BINDING_FLOOR = (4, 0, 2, 2, 1)
POLICY_MANIFEST_RELPATH = "tools/policy/policy-manifest.json"
RELEASE_CONSISTENCY_GATE = "python3 tools/cli.py lifecycle check-release --check"
TERMINAL = ("SHIPPED", "COMPLETE", "DEFERRED", "CANCELLED")
# Closed, case-sensitive marker vocabularies owned by the canonical schemas.
# Binding-era artifacts report any other present value with its file and value.
MARKER_VOCABULARY = {
    "Execution status": ("Pending", "Complete"),
    "Baseline effect": ("Improves", "Neutral", "Temporary pressure"),
    "UX gate": ("Yes", "No"),
}
DELIVERY_UNITS = (
    "One agent session, one shared sub-version branch, one PR per session",
    "One agent session, one shared sub-version branch, one sub-version PR",
    "One agent session, land each Ordered work step on development",
)
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
class WorkflowDirective:
    action: str
    handler: str | None
    mode: str
    authority: str
    primary_artifact: str | None
    pause: str
    branch: str | None = None

    def as_dict(self, reason: str) -> dict[str, str | None]:
        return {
            "action": self.action,
            "reason": reason,
            "handler": self.handler,
            "mode": self.mode,
            "authority": self.authority,
            "primaryArtifact": self.primary_artifact,
            "pause": self.pause,
            "branch": self.branch,
            "preDispatchGate": RELEASE_CONSISTENCY_GATE if self.handler is not None else None,
        }


LIFECYCLE_BRANCH_PREFIX = "lifecycle/"
PROMOTE_INTERRUPT_STAGES = frozenset(
    {
        "contracts-needed",
        "session-plan-needed",
        "session-ready",
        "archive-needed",
    }
)


def lifecycle_branch(subversion: str) -> str:
    """Return the as-built Branch marker for a sub-version.

    Live work lands on ``development``. Frozen as-builts still record
    ``lifecycle/<subversion>``.
    """
    return f"{LIFECYCLE_BRANCH_PREFIX}{subversion}"


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
    match = re.search(
        rf"\*\*{re.escape(label)}:\*\*[ \t]+([^\r\n]+?)[ \t]*$",
        text,
        re.I | re.M,
    )
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
    if marker(path, "Execution profile") != "Frontier autonomous coding agent":
        violations.append(
            "Execution profile must be Frontier autonomous coding agent"
        )
    if marker(path, "Delivery unit") not in DELIVERY_UNITS:
        violations.append(
            "Delivery unit must be one of: " + " | ".join(DELIVERY_UNITS)
        )
    for label in ("Roadmap coverage", "Internal phases", "Split triggers"):
        value = marker(path, label)
        if value is None or not value.strip():
            violations.append(f"{label} must be non-empty")
    phases = marker(path, "Internal phases") or ""
    if phases:
        phase_items = re.split(r";\s*(?=\d+\.\s+\S)", phases)
        phase_numbers = [
            int(match.group(1))
            for item in phase_items
            for match in [re.fullmatch(r"\s*(\d+)\.\s+\S.*", item)]
            if match is not None
        ]
        expected_phases = list(range(1, len(phase_items) + 1))
        if phase_numbers != expected_phases:
            violations.append(
                "Internal phases must be a contiguous ordered list starting at 1"
            )
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


def session_key(session: str) -> tuple[int, ...]:
    """Return the numeric ordering key for a session or sub-version id."""
    return tuple(int(part) for part in session.split("."))


def atomic_plan_binds(session: str) -> bool:
    """Return whether this session requires atomic proof rows."""
    return session_key(session) >= ATOMIC_PLAN_BINDING_FLOOR


def execution_receipt_binds(session: str) -> bool:
    """Return whether this session requires structured close-out receipts."""
    return session_key(session) >= EXECUTION_RECEIPT_BINDING_FLOOR


def plan_success_ids(plan: Path) -> list[str]:
    """Return the plan's ordered success-criterion identifiers."""
    success = section_bodies(plan, 2).get(
        "Success criteria (agent-runnable — show the output)", ""
    )
    return re.findall(r"^\s*-\s+\*\*(SC-\d+)\s+—", success, re.MULTILINE)


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
    atomic_proof = atomic_plan_binds(path.stem)
    if atomic_proof and marker(path, "Proof standard") != "Atomic":
        violations.append("Proof standard must be 'Atomic'")
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
    if ux_gate == "Yes":
        ordered_work = bodies.get("Implementation blueprint", "")
        # Schema requires a numbered dedicated UX step under ### Ordered work.
        ordered_section = re.search(
            r"^### Ordered work\s*\n([\s\S]*?)(?=^## |\Z)",
            ordered_work,
            re.MULTILINE,
        )
        ordered_body = ordered_section.group(1) if ordered_section else ""
        # Dedicated step: numbered item with an affirmative Run/Complete/
        # Perform/Execute ux-check action plus disposition/G-N. Reject only
        # when every action verb on the line is locally negated ("Do not Run
        # ux-check"); a later affirmative verb still counts.
        has_dedicated_ux_step = False
        for line_match in re.finditer(r"^\d+\.\s+\S.+$", ordered_body, re.MULTILINE):
            line = line_match.group(0)
            if not re.search(r"(?:\bdisposition\b|\bG-\d+\b)", line):
                continue
            for action in re.finditer(
                r"(?:Run|Complete|Perform|Execute)\s+ux-check\b",
                line,
                re.IGNORECASE,
            ):
                prefix = line[max(0, action.start() - 24) : action.start()]
                if re.search(
                    r"(?:\bnot|\bnever|\bdon'?t|\bdo\s+not)\s+$",
                    prefix,
                    re.IGNORECASE,
                ):
                    continue
                has_dedicated_ux_step = True
                break
            if has_dedicated_ux_step:
                break
        if not has_dedicated_ux_step:
            violations.append(
                "Ordered work must include a dedicated numbered ux-check step "
                "with operator disposition or G-N when Contract UX gate is Yes"
            )
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
    success_ids = plan_success_ids(path)
    expected_success = [f"SC-{number}" for number in range(1, len(success_ids) + 1)]
    if not success_ids or success_ids != expected_success:
        violations.append("SC-N criteria must be unique and contiguous from SC-1")
    for success_id in success_ids:
        match = re.search(
            rf"^\s*-\s+\*\*{re.escape(success_id)}\s+—([\s\S]*?)(?=^\s*-\s+\*\*SC-\d+\s+—|\Z)",
            success,
            re.MULTILINE,
        )
        if match is None:
            continue
        if atomic_proof:
            rows = re.findall(
                rf"^\s*\|\s*`?({re.escape(success_id)}\.\d+)`?\s*\|([^\n]+)$",
                match.group(1),
                re.MULTILINE,
            )
            proof_ids = [proof_id for proof_id, _ in rows]
            expected_proofs = [
                f"{success_id}.{number}" for number in range(1, len(rows) + 1)
            ]
            if not rows or proof_ids != expected_proofs:
                violations.append(
                    f"{success_id} proof identifiers must be unique and contiguous from {success_id}.1"
                )
            for proof_id, remainder in rows:
                cells = [cell.strip() for cell in remainder.strip().strip("|").split("|")]
                if len(cells) != 2 or "`" not in cells[0] or not cells[1]:
                    violations.append(
                        f"{proof_id} must contain one runnable evidence action and one required observable"
                    )
        elif "`" not in match.group(1) or "→" not in match.group(1):
            violations.append(
                f"{success_id} must pair a runnable command or inspection with exact output"
            )
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


def as_built_binds(subversion: str) -> bool:
    """Return whether an as-built for this sub-version uses the bound schema."""
    return session_key(subversion) >= AS_BUILT_BINDING_FLOOR


def as_built_schema_violations(
    path: Path,
    contract: Path,
    plan: Path,
    root: Path,
    per_session_delivery: bool,
    final_session: str | None = None,
) -> list[str]:
    """Return structural and marker violations for a session as-built record."""
    schema = root / AS_BUILT_SCHEMA_RELPATH
    required = schema_headings(schema, 2)
    if required is None:
        return [f"canonical as-built schema is unusable: {AS_BUILT_SCHEMA_RELPATH}"]
    text = path.read_text(encoding="utf-8")
    violations: list[str] = []
    first = next((line for line in text.splitlines() if line.strip()), "")
    if not first.startswith(f"# Session {path.stem} As-Built — "):
        violations.append(f"first heading must identify Session {path.stem} As-Built")
    actual_h2 = re.findall(r"^## (.+?)\s*$", text, re.MULTILINE)
    if actual_h2 != required:
        violations.append("required ## sections must appear exactly once in canonical order")
    if re.findall(r"^### ", text, re.MULTILINE):
        violations.append("as-built records contain no ### subsections")
    bodies = section_bodies(path, 2)
    for title in required:
        if not bodies.get(title, "").strip():
            violations.append(f"section {title!r} is empty")
    expected_markers = {
        "Record status": "Final",
        "Contract": str(contract.relative_to(root)),
        "Contract digest": f"sha256:{sha256(contract)}",
        "Plan": str(plan.relative_to(root)),
        "Plan digest": f"sha256:{sha256(plan)}",
        "Record standard": AS_BUILT_SCHEMA_RELPATH,
    }
    for label, expected_value in expected_markers.items():
        if marker(path, label) != expected_value:
            violations.append(f"{label} must be {expected_value!r}")
    recorded = marker(path, "Recorded")
    if recorded is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", recorded):
        violations.append("Recorded must be a YYYY-MM-DD date")
    subversion = ".".join(path.stem.split(".")[:-1])
    if marker(path, "Branch") != lifecycle_branch(subversion):
        violations.append(f"Branch must be {lifecycle_branch(subversion)!r}")
    pr_marker = marker(path, "PR") or ""
    is_final = final_session is None or path.stem == final_session
    if re.fullmatch(r"#\d+", pr_marker):
        if not (per_session_delivery or is_final):
            violations.append(
                "PR must defer to the final session under the one-sub-version-PR delivery unit"
            )
    elif re.fullmatch(r"Deferred to \d+(?:\.\d+)+", pr_marker):
        if per_session_delivery or is_final:
            violations.append("PR must be '#<number>' on a session that ships its own PR")
        elif final_session is not None and pr_marker != f"Deferred to {final_session}":
            violations.append(f"PR must be 'Deferred to {final_session}'")
    else:
        violations.append("PR must be '#<number>' or 'Deferred to <final session id>'")
    if re.search(r"\b(?:TBD|TODO|FIXME)\b|\bX\.Y\.N\b", text, re.IGNORECASE):
        violations.append("as-built contains a placeholder token")
    if execution_receipt_binds(path.stem):
        divergences = bodies.get("Divergences from plan", "").strip()
        if divergences != "None.":
            statements = re.findall(
                r"^\s*-\s+\*\*Plan statement:\*\*\s+\S[\s\S]*?(?=^\s*-\s+\*\*Plan statement:\*\*|\Z)",
                divergences,
                re.MULTILINE,
            )
            if not statements or "".join(statements).strip() != divergences:
                violations.append(
                    "Divergences from plan must be None. or exact structured items"
                )
            for statement in statements:
                for label in ("Built instead", "Why", "Authority"):
                    if not re.search(rf"^\s+\*\*{label}:\*\*\s+\S", statement, re.MULTILINE):
                        violations.append(f"each divergence must contain a non-empty {label} field")
                authority = re.search(
                    r"^\s+\*\*Authority:\*\*\s+(Operator|Evidence):\s+\S",
                    statement,
                    re.MULTILINE,
                )
                if authority is None:
                    violations.append(
                        "each divergence Authority must begin with Operator: or Evidence:"
                    )

        verification = bodies.get("Verification summary", "")
        recorded_success = re.findall(
            r"^\s*-\s+\*\*(SC-\d+):\*\*\s+`Passed`\s+—\s+\S.+$",
            verification,
            re.MULTILINE,
        )
        expected_success = plan_success_ids(plan)
        if recorded_success != expected_success:
            violations.append(
                "Verification summary must contain one ordered Passed line for every plan SC-N"
            )
        review_lines = re.findall(
            r"^\s*-\s+\*\*Adversarial review:\*\*\s+(.+)$",
            verification,
            re.MULTILINE,
        )
        receipt_pattern = re.compile(
            r"^Subject:\s+\S.+?"
            r";\s*Roles:\s+\S.+?"
            r";\s*Runtime identity:\s+requested=\S.+?"
            r",\s*observed=(?:Not observable|\S.+?)"
            r";\s*Verdict:\s+(?:PASS|CLEAN|CORRECTED)"
            r";\s*Disposition:\s+\S.+$"
        )
        if len(review_lines) != 1 or receipt_pattern.fullmatch(review_lines[0]) is None:
            violations.append(
                "Verification summary must contain one complete adversarial-review receipt"
            )
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
    incomplete = next((row for row in rows if not row.terminal), None)
    if incomplete:
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
            later_incomplete = any(
                not row.terminal
                and session_key(row.subversion) > session_key(incomplete.subversion)
                for row in rows
            )
            if later_incomplete:
                return invalid_state(
                    common,
                    f"{roadmap.relative_to(root)}: {incomplete.subversion} is nonterminal but every indexed session plan is complete",
                    errors,
                )
            return {
                **common,
                "stage": "archive-needed",
                "subversion": incomplete.subversion,
                "reason": (
                    "The last session of the version is complete. "
                    "Archive the master plan."
                ),
            }, errors

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
        later_incomplete = any(
            not row.terminal
            and session_key(row.subversion) > session_key(incomplete.subversion)
            for row in rows
        )
        return {
            **common,
            "stage": "session-ready",
            "subversion": incomplete.subversion,
            "session": session,
            "contract": str(contract.relative_to(root)),
            "sessionPlan": str(plan.relative_to(root)),
            "uxGate": ux_gate,
            "finalSession": remaining[-1][0] == session and not later_incomplete,
            "reason": plan_reason,
        }, errors

    return {
        **common,
        "stage": "archive-needed",
        "reason": "Every roadmap row is terminal. Archive the master plan.",
    }, errors


def directive_for(state: dict[str, object]) -> WorkflowDirective:
    stage = str(state["stage"])
    version = str(state.get("activeVersion", "the active version"))
    session = str(state.get("session", "the selected session"))

    if stage == "promote-needed":
        return WorkflowDirective(
            action="Promote development onto staging",
            handler="close-out",
            mode="execute",
            authority=(
                "Promote only. Merge Origin development onto staging. "
                "Do not cut a release or change Production."
            ),
            primary_artifact=str(state["masterPlan"]) if "masterPlan" in state else None,
            pause=(
                "After the promote, return to start-session for the next "
                "Ordered work step or plan."
            ),
            branch="development",
        )
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
            branch="development",
        )
    if stage == "contract-repair-needed":
        violations = "; ".join(str(item) for item in state.get("contractSchemaViolations", []))
        return WorkflowDirective(
            action=f"Repair contract {state['contract']} to the canonical schema: {violations}",
            handler=None,
            mode="report",
            authority="Limited to restoring the named contract's required schema on development.",
            primary_artifact=str(state["contract"]),
            pause="Contract repair is required before the session can be planned or executed.",
            branch="development",
        )
    if stage == "session-plan-needed":
        return WorkflowDirective(
            action=f"Plan session {session}",
            handler="plan-session",
            mode="plan",
            authority="Read-only until the session implementation plan is approved.",
            primary_artifact=str(state["contract"]),
            pause="Session-plan approval is required.",
            branch="development",
        )
    if stage == "session-ready":
        pause = (
            "Pause to discuss design conflicts with the operator, or on an "
            "explicit operator gate; reshape in-session and continue."
        )
        if state.get("uxGate") == "Yes":
            pause = (
                "UX gate: Complete the dedicated UX Ordered-work step (`ux-check` plus "
                "the operator's local browser review) before awaiting close-out; "
                "also pause to discuss design conflicts and reshape in-session."
            )
        return WorkflowDirective(
            action=f"Execute approved session {session}",
            handler="start-session",
            mode="execute",
            authority=(
                "The contract and product scope remain frozen. The approved "
                "plan is the starting prompt; reshape only its interfaces or "
                "steps through in-session operator discussion, record the "
                "divergence in the as-built, and continue forward."
            ),
            primary_artifact=str(state["sessionPlan"]),
            pause=pause,
            branch="development",
        )
    if stage == "archive-needed":
        return WorkflowDirective(
            action=f"Archive the completed version {version} bundle",
            handler="start-session",
            mode="execute",
            authority="Archive the master plan, contracts, session plans, and as-builts.",
            primary_artifact=str(state["masterPlan"]) if "masterPlan" in state else None,
            pause=(
                "After archive, the next Start Session waits on product "
                "direction for the next master plan."
            ),
            branch="development",
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


def _run_git(root: Path, *args: str) -> str | None:
    """Return stripped stdout of a git command under root, or None on failure."""
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


def git_warnings(root: Path, state: dict[str, object]) -> list[str]:
    """Return non-blocking warnings from the current local git snapshot.

    Execute directives accept ``development`` or ``lifecycle/<session>-ow-<n>``.
    Plan directives check worktree cleanliness. Every state checks whether
    local ``development`` or ``main`` trails the matching origin ref. An
    unexpected branch only warns and never changes the resolved stage.
    Missing git state degrades to no warning.
    """

    if _run_git(root, "rev-parse", "--is-inside-work-tree") != "true":
        return []

    warnings: list[str] = []
    directive = state.get("directive")
    mode = directive.get("mode") if isinstance(directive, dict) else None
    branch = _run_git(root, "symbolic-ref", "--quiet", "--short", "HEAD")

    if mode == "execute" and branch:
        ow_branch = re.fullmatch(r"lifecycle/.+-ow-\d+", branch) is not None
        if branch in {"main", "staging"}:
            warnings.append(
                f"current branch is {branch}; work from development or the OW lifecycle branch"
            )
        elif branch != "development" and not ow_branch:
            warnings.append(
                f"current branch {branch!r} is not development or an OW lifecycle branch"
            )

    if mode == "plan":
        worktree = _run_git(root, "status", "--porcelain")
        if worktree:
            warnings.append("plan-mode directive has a dirty worktree")

    for line in ("development", "main"):
        local_ref = _run_git(root, "rev-parse", "--verify", f"refs/heads/{line}")
        origin_ref = _run_git(root, "rev-parse", "--verify", f"refs/remotes/origin/{line}")
        if local_ref and origin_ref and local_ref != origin_ref:
            behind_count = _run_git(
                root,
                "rev-list",
                "--count",
                f"refs/heads/{line}..refs/remotes/origin/{line}",
            )
            if behind_count and behind_count.isdigit() and int(behind_count) > 0:
                warnings.append(
                    f"local {line} is behind origin/{line} by {behind_count} commit(s)"
                )

    return warnings


def apply_promote_interrupt(
    state: dict[str, object],
    count: int | None,
) -> dict[str, object]:
    """Send building stages to promote when the app-facing pile hits 80."""
    if count is None or count < PROMOTE_TRIGGER:
        return state
    if str(state.get("stage")) not in PROMOTE_INTERRUPT_STAGES:
        return state
    return {
        **state,
        "stage": "promote-needed",
        "appFacing": count,
        "reason": (
            f"App-facing count versus staging is {count}/{PROMOTE_BAR}. "
            "Promote development onto staging before more Ordered work or planning."
        ),
    }


def resolve(
    root: Path = DEFAULT_ROOT,
    *,
    app_facing: int | None = None,
) -> tuple[dict[str, object], list[str]]:
    state, errors = resolve_state(root)
    count = try_app_facing_count(root) if app_facing is None else app_facing
    state = apply_promote_interrupt(state, count)
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
