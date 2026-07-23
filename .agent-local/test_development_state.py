#!/usr/bin/env python3
"""Fixture tests for the LGI.tools development-state resolver."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

from resolve_development_state import (
    RELEASE_CONSISTENCY_GATE,
    lifecycle_branch,
    required_contract_sections,
    resolve,
)


SHA = "a" * 40
RESOLVER = Path(__file__).with_name("resolve_development_state.py")
CONTRACT_TITLES = (
    "Objective",
    "Current context and dependencies",
    "Done conditions",
    "In scope",
    "Out of scope",
    "Hard constraints",
    "Decisions the session plan must resolve",
    "Acceptance criteria",
    "Verification",
    "UX/operator gates",
    "Baseline/hotspot boundary",
    "Close-out behavior",
)
PLAN_TITLES = (
    "Bottom line (READ FIRST)",
    "Read first",
    "Current state and prerequisites",
    "Why now",
    "Scope (the destination)",
    "Resolved implementation decisions",
    "Design pressure and baseline effect",
    "Implementation blueprint",
    "Success criteria (agent-runnable — show the output)",
    "End of session",
)
PLAN_SUBTITLES = (
    "Scope coverage",
    "Audit-remediation mapping",
    "Hotspot proximity",
    "Preparatory refactor",
    "Baseline effect and update",
    "Owned surfaces",
    "Interfaces and contracts",
    "Control and data flow",
    "Edge and failure behavior",
    "Ordered work",
)


class ResolverFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.docs = self.root / "docs"
        self.docs.mkdir()
        procedure = self.docs / "workflows/version-audit.md"
        procedure.parent.mkdir(parents=True, exist_ok=True)
        procedure.write_text("# Audit procedure\n", encoding="utf-8")
        self.write_schemas()
        self.write_roadmap("COMPLETE")
        self.write_baseline(SHA)

    def close(self) -> None:
        self.temporary.cleanup()

    def write_roadmap(self, status: str) -> None:
        (self.docs / "VERSION_9_9_PLAN.md").write_text(
            "# Version 9.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            f"| 9.9.1.1 | Fixture | 1 | {status} |\n",
            encoding="utf-8",
        )

    def write_baseline(self, code_ref: str) -> None:
        (self.docs / "CODE_HEALTH_BASELINE.md").write_text(
            f"# Baseline\n\n| Field | Value |\n| --- | --- |\n| Code ref | `{code_ref}` |\n",
            encoding="utf-8",
        )

    def write_schemas(
        self,
        *,
        contract_titles: tuple[str, ...] = CONTRACT_TITLES,
    ) -> None:
        directory = self.docs / "workflows/schema"
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "session-contract.md").write_text(
            "# Contract schema\n\n"
            + "\n\n".join(
                f"## {number}. {title}\n\nFixture guidance."
                for number, title in enumerate(contract_titles, start=1)
            )
            + "\n",
            encoding="utf-8",
        )
        subtitle_counts = {
            "Scope (the destination)": 1,
            "Resolved implementation decisions": 1,
            "Design pressure and baseline effect": 3,
            "Implementation blueprint": 5,
        }
        plan_parts = ["# Plan schema"]
        subtitle_index = 0
        for title in PLAN_TITLES:
            plan_parts.append(f"## {title}\n\nFixture guidance.")
            for _ in range(subtitle_counts.get(title, 0)):
                plan_parts.append(
                    f"### {PLAN_SUBTITLES[subtitle_index]}\n\nFixture guidance."
                )
                subtitle_index += 1
        (directory / "session-plan.md").write_text(
            "\n\n".join(plan_parts) + "\n",
            encoding="utf-8",
        )

    def write_audit(self, status: str, finding_status: str | None = None, *, digest: str | None = None) -> None:
        procedure = self.docs / "workflows/version-audit.md"
        procedure_digest = digest or hashlib.sha256(procedure.read_bytes()).hexdigest()
        findings = ""
        if finding_status:
            findings = (
                "\n## Audit findings\n\n"
                "| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |\n"
                "| --- | ---: | --- | --- | --- | --- | --- |\n"
                f"| AF-001 | 1 | Campaign | leaked policy | one owner | 9.9.1.1 | {finding_status} |\n"
            )
        path = self.docs / "version-audits/9.9/PLAN.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "# Audit plan\n\n"
            f"**Audit status:** {status}\n"
            "**Audit cycle:** 1\n"
            f"**Audited ref:** `{SHA}`\n"
            "**Audit mode:** Version close\n"
            "**Procedure:** `docs/workflows/version-audit.md`\n"
            f"**Procedure digest:** `sha256:{procedure_digest}`\n"
            f"{findings}",
            encoding="utf-8",
        )

    def write_contract(self, ux_gate: str | None = "No") -> Path:
        directory = self.docs / "session-contracts/9.9"
        directory.mkdir(parents=True, exist_ok=True)
        contract = directory / "9.9.1.1.1.md"
        ux_marker = f"\n**UX gate:** {ux_gate}\n" if ux_gate is not None else ""
        execution_frame = (
            "**Execution profile:** Frontier autonomous coding agent\n"
            "**Delivery unit:** One agent session, one shared sub-version branch, one sub-version PR\n"
            "**Roadmap coverage:** §9.9.1.1 fixture outcome\n"
            "**Internal phases:** 1. Implement fixture; 2. Verify fixture\n"
            "**Split triggers:** Material fixture scope conflict\n"
        )
        bodies = {
            "Objective": "Fixture outcome.",
            "Current context and dependencies": "- **DEP-1:** Fixture dependency.",
            "Done conditions": "- **DC-1:** Fixture is complete.",
            "In scope": "- **IS-1:** Fixture boundary.",
            "Out of scope": "- **OOS-1:** Unrelated work.",
            "Hard constraints": "- **HC-1:** Preserve the fixture.",
            "Decisions the session plan must resolve": "- **PD-1:** Choose the fixture seam.",
            "Acceptance criteria": "- **AC-1:** Proves DC-1 through observable fixture output.",
            "Verification": "- **V-1:** Fixture command evidence.",
            "UX/operator gates": "UX gate consequence only; no additional operator gate.",
            "Baseline/hotspot boundary": "Neutral fixture boundary.",
            "Close-out behavior": "Commit the fixture result.",
        }
        contract.write_text(
            "## Session 9.9.1.1.1 — Fixture\n\n"
            "**Sub-version:** 9.9.1.1\n"
            "**Master plan:** `docs/VERSION_9_9_PLAN.md` §9.9.1.1\n"
            f"{ux_marker}{execution_frame}\n"
            + "\n\n".join(
                f"## {number}. {title}\n\n{bodies[title]}"
                for number, title in enumerate(CONTRACT_TITLES, start=1)
            )
            + "\n",
            encoding="utf-8",
        )
        (directory / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 9.9.1.1.1 | 9.9.1.1 | `9.9.1.1.1.md` |\n",
            encoding="utf-8",
        )
        return contract

    def write_session_plan(
        self,
        contract: Path,
        *,
        execution_status: str = "Pending",
        baseline_effect: str | None = "Neutral",
    ) -> None:
        directory = self.docs / "session-plans/9.9"
        directory.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(contract.read_bytes()).hexdigest()
        baseline_marker = (
            f"**Baseline effect:** {baseline_effect}\n"
            if baseline_effect is not None
            else ""
        )
        ux_gate = next(
            (
                line.removeprefix("**UX gate:** ")
                for line in contract.read_text(encoding="utf-8").splitlines()
                if line.startswith("**UX gate:** ")
            ),
            "No",
        )
        body = f"""# Session 9.9.1.1.1 Implementation Plan — Fixture

**Plan status:** Approved
**Approved:** 2026-07-20
**Contract:** `docs/session-contracts/9.9/9.9.1.1.1.md`
**Contract digest:** `sha256:{digest}`
**Planning standard:** `docs/workflows/schema/session-plan.md`
**Execution status:** {execution_status}
{baseline_marker}
## Bottom line (READ FIRST)

- **GOAL:** Deliver the fixture outcome.
- **DONE =** SC-1 through SC-2 with observable fixture output.
- **OUT OF SCOPE:** OOS-1 remains untouched.

<hard_constraints>

- **Contract HC-1:** Preserve the fixture.

</hard_constraints>

**Branch:** `codex/9.9.1.1-fixture` · **ends in PR:** no · **gate:** fixture evidence

**Contract UX gate:** `{ux_gate}` · **required pause:** None

## Read first

- `AGENTS.md`
- `docs/session-contracts/9.9/9.9.1.1.1.md`

## Current state and prerequisites

| Contract input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| `DEP-1` | `Verified` | fixture evidence | proceed |

## Why now

The fixture unlocks the resolver test.

## Scope (the destination)

Deliver DC-1 within IS-1 while protecting OOS-1.

### Scope coverage

| Contract boundary | Implementation mapping or protection |
| --- | --- |
| `IS-1` | Deliver the fixture. |
| `OOS-1` | Inspect the diff. |

## Resolved implementation decisions

- **Contract PD-1 — Fixture seam: selected.** Evidence supports it. **Rejected:** parallel ownership.

### Audit-remediation mapping

Not applicable — this is not an audit-remediation contract.

## Design pressure and baseline effect

### Hotspot proximity

- **Touched measured surfaces:** None.
- **Live proximity evidence:** Outside measured hotspots.

### Preparatory refactor

None; the fixture exposes the required seam.

### Baseline effect and update

- **Effect:** `{baseline_effect or 'Neutral'}` — the fixture adds no pressure.
- **Required update:** None.

## Implementation blueprint

### Owned surfaces

- Resolver fixture — owns schema proof.

### Interfaces and contracts

- No production export changes.

### Control and data flow

No runtime data flow changes.

### Edge and failure behavior

- Invalid fixture → resolver reports the violation.

### Ordered work

1. Implement the fixture contract.
2. Prove its resolver result.

## Success criteria (agent-runnable — show the output)

- **SC-1 — Contract DC-1 / AC-1 / V-1.** `fixture focused` → fixture passes.
- **SC-2 — Contract delivery.** `fixture gate` → clean result.

## End of session

- Confirm DONE and HC-1.
- **Delivery:** Commit the fixture evidence.
- **Lifecycle artifacts:** Mark the plan complete when appropriate.
- **Handoff:** Rerun the resolver.
"""
        (directory / "9.9.1.1.1.md").write_text(body, encoding="utf-8")

    def init_git(self, branch: str) -> None:
        subprocess.run(
            ["git", "init", "-b", branch, str(self.root)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def set_head(self, branch: str) -> None:
        """Point HEAD at a (possibly unborn) branch without touching the tree."""
        subprocess.run(
            ["git", "-C", str(self.root), "symbolic-ref", "HEAD", f"refs/heads/{branch}"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )


class DevelopmentStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ResolverFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def resolved(self) -> dict[str, object]:
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        directive = state.get("directive")
        self.assertIsInstance(directive, dict)
        assert isinstance(directive, dict)
        self.assertEqual(
            {
                "action",
                "reason",
                "handler",
                "mode",
                "authority",
                "primaryArtifact",
                "pause",
                "branch",
                "preDispatchGate",
            },
            set(directive),
        )
        self.assertIn(directive["mode"], {"plan", "execute", "report"})
        for field in ("action", "reason", "authority", "pause"):
            self.assertIsInstance(directive[field], str)
            self.assertTrue(directive[field])
        if directive["handler"] is None:
            self.assertIsNone(directive["preDispatchGate"])
        else:
            self.assertEqual(RELEASE_CONSISTENCY_GATE, directive["preDispatchGate"])
        return state

    def stage(self) -> str:
        return str(self.resolved()["stage"])

    def handler(self) -> str | None:
        directive = self.resolved()["directive"]
        assert isinstance(directive, dict)
        value = directive["handler"]
        return str(value) if value is not None else None

    def cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(RESOLVER),
                "--root",
                str(self.fixture.root),
                *args,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def test_initial_approved_audit_is_ready(self) -> None:
        self.fixture.write_audit("Approved")
        self.assertEqual("audit-ready", self.stage())
        self.assertEqual("version-audit", self.handler())

    def test_missing_audit_plan_routes_to_audit_planning(self) -> None:
        self.assertEqual("audit-plan-needed", self.stage())
        self.assertEqual("plan-version-audit", self.handler())

    def test_terminal_roadmap_statuses_require_exact_tokens(self) -> None:
        for status in ("INCOMPLETE", "NOT SHIPPED", "SHIPPED (PR #247)"):
            with self.subTest(status=status):
                self.fixture.write_roadmap(status)
                state, errors = resolve(self.fixture.root)
                self.assertEqual("contracts-needed", state["stage"])
                self.assertTrue(
                    any(
                        "docs/VERSION_9_9_PLAN.md" in error and repr(status) in error
                        for error in errors
                    )
                )

        for status in ("SHIPPED", "COMPLETE"):
            with self.subTest(status=status):
                self.fixture.write_roadmap(status)
                state, errors = resolve(self.fixture.root)
                self.assertEqual([], errors)
                self.assertEqual("audit-plan-needed", state["stage"])

    def test_open_finding_requires_remediation_plan(self) -> None:
        self.fixture.write_audit("Remediation required", "Open")
        self.assertEqual("audit-remediation-plan-needed", self.stage())
        self.assertEqual("plan-audit-remediation", self.handler())

    def test_remediation_routes_through_session_planning_and_execution(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_audit("Remediation in progress", "Planned")
        contract = self.fixture.write_contract()
        self.assertEqual("session-plan-needed", self.stage())
        self.assertEqual("plan-session", self.handler())
        self.fixture.write_session_plan(contract)
        self.assertEqual("session-ready", self.stage())
        self.assertEqual("start-session", self.handler())

    def test_invalid_session_plan_marker_values_name_file_and_value(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        for label, value, kwargs in (
            ("Baseline effect", "Mixed", {"baseline_effect": "Mixed"}),
            ("Execution status", "Done", {"execution_status": "Done"}),
        ):
            with self.subTest(label=label):
                self.fixture.write_session_plan(contract, **kwargs)
                state, errors = resolve(self.fixture.root)
                self.assertEqual("session-plan-needed", state["stage"])
                self.assertTrue(
                    any(
                        "docs/session-plans/9.9/9.9.1.1.1.md" in error
                        and label in error
                        and repr(value) in error
                        for error in errors
                    )
                )

    def test_missing_binding_markers_route_to_session_planning(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract, baseline_effect=None)
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-plan-needed", state["stage"])
        self.assertEqual(
            "The session plan is missing its Baseline effect marker.",
            state["reason"],
        )

        contract = self.fixture.write_contract(ux_gate=None)
        self.fixture.write_session_plan(contract)
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("contract-repair-needed", state["stage"])
        self.assertIn("UX gate must be Yes or No", state["contractSchemaViolations"])

    def test_contract_missing_a_required_section_routes_to_repair(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        text = contract.read_text(encoding="utf-8")
        contract.write_text(
            re.sub(r"\n## 12\. Close-out behavior[\s\S]*\Z", "\n", text),
            encoding="utf-8",
        )

        state, errors = resolve(self.fixture.root)

        self.assertEqual([], errors)
        self.assertEqual("contract-repair-needed", state["stage"])
        self.assertEqual(["Close-out behavior"], state["missingContractSections"])
        self.assertEqual(
            "docs/session-contracts/9.9/9.9.1.1.1.md",
            state["directive"]["primaryArtifact"],
        )
        self.assertIsNone(state["directive"]["handler"])
        self.assertIsNone(state["directive"]["preDispatchGate"])

    def test_contract_requirements_are_derived_from_the_schema(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()
        renamed = list(CONTRACT_TITLES)
        renamed[4] = "Explicit exclusions"
        self.fixture.write_schemas(contract_titles=tuple(renamed))

        state, errors = resolve(self.fixture.root)

        self.assertEqual([], errors)
        self.assertEqual("contract-repair-needed", state["stage"])
        self.assertEqual(["Explicit exclusions"], state["missingContractSections"])

    def test_unusable_contract_schema_is_a_blocking_invalid_state(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()
        schema = self.fixture.docs / "workflows/schema/session-contract.md"
        cases = {
            "absent": None,
            "empty": "# Contract schema\n",
            "duplicate": "# Contract schema\n\n## 1. Same\n\n## 2. Same\n",
            "non-contiguous": "# Contract schema\n\n## 1. One\n\n## 3. Three\n",
        }
        for label, contents in cases.items():
            with self.subTest(label=label):
                if contents is None:
                    schema.unlink(missing_ok=True)
                else:
                    schema.write_text(contents, encoding="utf-8")
                state, errors = resolve(self.fixture.root)
                self.assertEqual("invalid", state["stage"])
                self.assertTrue(errors)
                self.fixture.write_schemas()

    def test_missing_indexed_contract_remains_invalid_not_repair(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        contract.unlink()

        state, errors = resolve(self.fixture.root)

        self.assertEqual("invalid", state["stage"])
        self.assertNotEqual("contract-repair-needed", state["stage"])
        self.assertTrue(any("points to missing" in error for error in errors))

    def test_invalid_approved_plan_routes_back_to_planning(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        plan = self.fixture.docs / "session-plans/9.9/9.9.1.1.1.md"
        plan.write_text(
            re.sub(r"\n## End of session[\s\S]*\Z", "\n", plan.read_text(encoding="utf-8")),
            encoding="utf-8",
        )

        state, errors = resolve(self.fixture.root)

        self.assertEqual("session-plan-needed", state["stage"])
        self.assertEqual(
            "The session plan does not conform to the canonical schema.",
            state["reason"],
        )
        self.assertTrue(any("required ## sections" in error for error in errors))

    def test_plan_schema_enforces_contract_coverage_and_verified_inputs(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        plan = self.fixture.docs / "session-plans/9.9/9.9.1.1.1.md"
        cases = {
            "decision coverage": (
                "Contract PD-1",
                "Contract decision",
                "PD-1 is missing from Resolved implementation decisions",
            ),
            "blocking input": (
                "| `DEP-1` | `Verified` |",
                "| `DEP-1` | `Blocking` |",
                "an approved plan cannot contain a Blocking prerequisite",
            ),
        }
        for label, (old, new, expected) in cases.items():
            with self.subTest(label=label):
                self.fixture.write_session_plan(contract)
                plan.write_text(
                    plan.read_text(encoding="utf-8").replace(old, new),
                    encoding="utf-8",
                )
                state, errors = resolve(self.fixture.root)
                self.assertEqual("session-plan-needed", state["stage"])
                self.assertIn(expected, errors)

    def test_contract_schema_rejects_wrong_numbering_and_extra_sections(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        contract.write_text(
            contract.read_text(encoding="utf-8").replace(
                "## 4. In scope",
                "## 9. In scope\n\n## Notes\n\nExtra contract section.",
            ),
            encoding="utf-8",
        )

        state, errors = resolve(self.fixture.root)

        self.assertEqual([], errors)
        self.assertEqual("contract-repair-needed", state["stage"])
        self.assertIn(
            "contract headings must be the session heading plus canonical numbered sections only",
            state["contractSchemaViolations"],
        )

    def test_exact_manifest_allowlist_grandfathers_legacy_artifacts(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        plan = self.fixture.docs / "session-plans/9.9/9.9.1.1.1.md"
        contract.write_text(
            "## Session 9.9.1.1.1 — Legacy\n\n**UX gate:** No\n",
            encoding="utf-8",
        )
        digest = hashlib.sha256(contract.read_bytes()).hexdigest()
        plan.write_text(
            "# Legacy plan\n\n"
            "**Plan status:** Approved\n"
            f"**Contract digest:** `sha256:{digest}`\n"
            "**Execution status:** Pending\n"
            "**Baseline effect:** Neutral\n",
            encoding="utf-8",
        )
        manifest = self.fixture.root / ".agent-local/policy-manifest.json"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(
            json.dumps(
                {
                    "developmentState": {
                        "legacySchemaArtifacts": [
                            "docs/session-contracts/9.9/9.9.1.1.1.md",
                            "docs/session-plans/9.9/9.9.1.1.1.md",
                        ]
                    }
                }
            ),
            encoding="utf-8",
        )

        self.assertEqual("session-ready", self.stage())

    def test_real_contract_schema_retains_all_twelve_canonical_titles(self) -> None:
        self.assertEqual(
            list(CONTRACT_TITLES),
            required_contract_sections(RESOLVER.parents[1]),
        )

    def test_invalid_ux_gate_names_contract_and_value(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract(ux_gate="Maybe")
        self.fixture.write_session_plan(contract)
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("contract-repair-needed", state["stage"])
        self.assertIn("UX gate must be Yes or No", state["contractSchemaViolations"])

    def test_contract_execution_frame_is_required(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        cases = {
            "profile": (
                "**Execution profile:** Frontier autonomous coding agent\n",
                "",
                "Execution profile must be Frontier autonomous coding agent",
            ),
            "delivery unit": (
                "**Delivery unit:** One agent session, one shared sub-version branch, one sub-version PR\n",
                "**Delivery unit:** One branch\n",
                "Delivery unit must be One agent session, one shared sub-version branch, one sub-version PR",
            ),
            "roadmap coverage": (
                "**Roadmap coverage:** §9.9.1.1 fixture outcome\n",
                "**Roadmap coverage:**   \n",
                "Roadmap coverage must be non-empty",
            ),
            "ordered phases": (
                "**Internal phases:** 1. Implement fixture; 2. Verify fixture\n",
                "**Internal phases:** Implement fixture\n",
                "Internal phases must be a contiguous ordered list starting at 1",
            ),
            "gapped phases": (
                "**Internal phases:** 1. Implement fixture; 2. Verify fixture\n",
                "**Internal phases:** 1. Implement fixture; 3. Verify fixture\n",
                "Internal phases must be a contiguous ordered list starting at 1",
            ),
            "split triggers": (
                "**Split triggers:** Material fixture scope conflict\n",
                "**Split triggers:**   \n",
                "Split triggers must be non-empty",
            ),
        }
        original = contract.read_text(encoding="utf-8")
        for label, (old, new, expected) in cases.items():
            with self.subTest(label=label):
                contract.write_text(original.replace(old, new), encoding="utf-8")
                state, errors = resolve(self.fixture.root)
                self.assertEqual([], errors)
                self.assertEqual("contract-repair-needed", state["stage"])
                self.assertIn(expected, state["contractSchemaViolations"])
        contract.write_text(
            original.replace(
                "1. Implement fixture; 2. Verify fixture",
                "1. Handle TCP; UDP, and ICMP; 2. Verify fixture",
            ),
            encoding="utf-8",
        )
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-plan-needed", state["stage"])
        contract.write_text(original, encoding="utf-8")

    def test_ux_gate_flows_into_session_ready_pause(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract(ux_gate="Yes")
        self.fixture.write_session_plan(contract)
        state = self.resolved()
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIn("The operator's local browser review is required", directive["pause"])

        contract = self.fixture.write_contract(ux_gate="No")
        self.fixture.write_session_plan(contract)
        state = self.resolved()
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertEqual(
            "Pause on a material scope/design conflict or an explicit operator gate.",
            directive["pause"],
        )

    def test_session_ready_directive_carries_deterministic_lifecycle_branch(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        state = self.resolved()
        directive = state["directive"]
        assert isinstance(directive, dict)
        subversion = str(state["subversion"])
        # The branch is a pure function of the sub-version: no runtime prefix, no slug.
        self.assertEqual(f"lifecycle/{subversion}", directive["branch"])
        self.assertEqual(lifecycle_branch(subversion), directive["branch"])

    def test_lifecycle_branch_helper_is_prefix_free(self) -> None:
        self.assertEqual("lifecycle/3.10.0.4", lifecycle_branch("3.10.0.4"))
        self.assertEqual("lifecycle/9.9.1.1", lifecycle_branch("9.9.1.1"))

    def test_planning_directives_carry_the_lifecycle_branch(self) -> None:
        # The deterministic branch also carries planning, so start-session can
        # discover and resume the same branch for the whole sub-version.
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()  # contract present, no session plan yet
        state = self.resolved()
        self.assertEqual("session-plan-needed", state["stage"])
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertEqual("lifecycle/9.9.1.1", directive["branch"])

    def test_resolver_output_ignores_the_checked_out_branch(self) -> None:
        # Branch names carry no lifecycle meaning: every checkout — including a
        # rider/* or codex/ one — yields the identical stage and directive branch.
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        baseline, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-ready", baseline["stage"])
        baseline_directive = baseline["directive"]
        assert isinstance(baseline_directive, dict)
        self.assertEqual("lifecycle/9.9.1.1", baseline_directive["branch"])
        self.fixture.init_git("main")
        for branch in ("main", "feature/x", "codex/x", "rider/quick-fix", "misc"):
            self.fixture.set_head(branch)
            state, branch_errors = resolve(self.fixture.root)
            self.assertEqual([], branch_errors)
            directive = state["directive"]
            assert isinstance(directive, dict)
            self.assertEqual(baseline["stage"], state["stage"])
            self.assertEqual(baseline_directive["branch"], directive["branch"])

    def test_rider_branch_has_no_special_meaning(self) -> None:
        # The retired rider system: a rider/* checkout resolves like any other —
        # a normal session-ready directive with the release gate, never a bypass.
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        self.fixture.init_git("rider/quick-fix")
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-ready", state["stage"])
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertEqual("start-session", directive["handler"])
        self.assertEqual("lifecycle/9.9.1.1", directive["branch"])
        self.assertEqual(RELEASE_CONSISTENCY_GATE, directive["preDispatchGate"])

    def test_resolver_has_no_flow_track_bypass(self) -> None:
        # Ordinary work never invokes the resolver, and the resolver itself keeps
        # no branch bypass: rider_state is gone and no branch yields a rider stage.
        import resolve_development_state as module

        self.assertFalse(hasattr(module, "rider_state"))
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        self.fixture.init_git("main")
        for branch in ("main", "rider/quick-fix", "codex/tooling"):
            self.fixture.set_head(branch)
            state, _ = resolve(self.fixture.root)
            self.assertNotEqual("rider", state["stage"])

    def test_completed_subversion_is_not_redispatched_after_merge(self) -> None:
        # A fresh checkout after a final planned merge resolves the NEXT real
        # action, never re-dispatching the already-shipped sub-version's session.
        (self.fixture.docs / "VERSION_9_9_PLAN.md").write_text(
            "# Version 9.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            "| 9.9.1.1 | Shipped work | 1 | SHIPPED |\n"
            "| 9.9.1.2 | Next work | 1 | PLANNED |\n",
            encoding="utf-8",
        )
        # 9.9.1.1's contract/plan exist and are complete; the resolver advances past them.
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract, execution_status="Complete")
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("contracts-needed", state["stage"])
        self.assertEqual("9.9.1.2", state["subversion"])
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertEqual("lifecycle/9.9.1.2", directive["branch"])

    def test_pre_3_9_artifacts_are_exempt_from_binding_markers(self) -> None:
        (self.fixture.docs / "VERSION_9_9_PLAN.md").unlink()
        (self.fixture.docs / "VERSION_2_9_PLAN.md").write_text(
            "# Version 2.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            "| 2.9.1.1 | Fixture | 1 | PLANNED |\n",
            encoding="utf-8",
        )
        contract_dir = self.fixture.docs / "session-contracts/2.9"
        contract_dir.mkdir(parents=True)
        contract = contract_dir / "2.9.1.1.1.md"
        contract.write_text("## Legacy contract\n", encoding="utf-8")
        (contract_dir / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 2.9.1.1.1 | 2.9.1.1 | `2.9.1.1.1.md` |\n",
            encoding="utf-8",
        )
        plan_dir = self.fixture.docs / "session-plans/2.9"
        plan_dir.mkdir(parents=True)
        digest = hashlib.sha256(contract.read_bytes()).hexdigest()
        (plan_dir / "2.9.1.1.1.md").write_text(
            "# Legacy session plan\n\n"
            "**Plan status:** Approved\n"
            f"**Contract digest:** `sha256:{digest}`\n"
            "**Execution status:** Pending\n",
            encoding="utf-8",
        )

        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-ready", state["stage"])

    def test_git_warnings_cover_plan_worktree_and_execute_branch_drift(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()
        self.fixture.init_git("misc")

        # Plan mode (no session plan yet) warns on the dirty fixture worktree.
        plan_result = self.cli("--git")
        self.assertEqual(0, plan_result.returncode)
        plan_payload = json.loads(plan_result.stdout)
        self.assertIn("plan-mode directive has a dirty worktree", plan_payload["warnings"])

        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)

        # Execute mode off the deterministic lifecycle branch warns and names the
        # exact lifecycle/<sub-version> branch to check out.
        misc_payload = json.loads(self.cli("--git").stdout)
        self.assertTrue(
            any(
                "is not the lifecycle/9.9.1.1 lifecycle branch" in warning
                for warning in misc_payload["warnings"]
            )
        )

        # A codex/* branch has no special meaning any more: it warns like any other.
        self.fixture.set_head("codex/tooling")
        codex_payload = json.loads(self.cli("--git").stdout)
        self.assertTrue(
            any(
                "is not the lifecycle/9.9.1.1 lifecycle branch" in warning
                for warning in codex_payload["warnings"]
            )
        )

        # On the correct lifecycle branch there is no branch-drift warning.
        self.fixture.set_head("lifecycle/9.9.1.1")
        on_branch_payload = json.loads(self.cli("--git").stdout)
        self.assertFalse(
            any("lifecycle branch" in warning for warning in on_branch_payload["warnings"])
        )

        # main gets the explicit check-out-the-lifecycle-branch message.
        self.fixture.set_head("main")
        main_payload = json.loads(self.cli("--git").stdout)
        self.assertIn(
            "current branch is main; check out the lifecycle/9.9.1.1 lifecycle branch",
            main_payload["warnings"],
        )

    def test_git_warnings_are_silent_for_non_git_roots(self) -> None:
        result = self.cli("--git")
        self.assertEqual(0, result.returncode)
        payload = json.loads(result.stdout)
        self.assertEqual([], payload["warnings"])

    def test_git_check_prints_warnings_without_failing(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()
        self.fixture.init_git("main")
        result = self.cli("--git", "--check")
        self.assertEqual(0, result.returncode)
        self.assertIn("workflow state warning:", result.stdout)
        self.assertIn("workflow state valid: session-plan-needed", result.stdout)

    def test_local_main_behind_origin_main_warns(self) -> None:
        self.fixture.init_git("main")
        subprocess.run(
            ["git", "-C", str(self.fixture.root), "add", "."],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-m",
                "fixture",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        local_main = subprocess.run(
            ["git", "-C", str(self.fixture.root), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "--allow-empty",
                "-m",
                "origin fixture",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        origin_main = subprocess.run(
            ["git", "-C", str(self.fixture.root), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "update-ref",
                "refs/remotes/origin/main",
                origin_main,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "reset",
                "--hard",
                local_main,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        result = self.cli("--git")
        self.assertEqual(0, result.returncode)
        payload = json.loads(result.stdout)
        self.assertIn(
            "local main is behind origin/main by 1 commit(s)",
            payload["warnings"],
        )

    def test_git_flag_is_the_only_default_payload_difference(self) -> None:
        default_before = self.cli()
        default_after = self.cli()
        self.assertEqual(0, default_before.returncode)
        self.assertEqual(default_before.stdout, default_after.stdout)
        default_payload = json.loads(default_before.stdout)
        self.assertNotIn("warnings", default_payload)

        flagged = self.cli("--git")
        self.assertEqual(0, flagged.returncode)
        flagged_payload = json.loads(flagged.stdout)
        warnings = flagged_payload.pop("warnings")
        self.assertEqual([], warnings)
        self.assertEqual(default_payload, flagged_payload)

    def test_delivered_remediation_restarts_audit(self) -> None:
        self.fixture.write_audit("Remediation in progress", "Delivered")
        state = self.resolved()
        self.assertEqual("audit-restart-ready", state["stage"])
        self.assertEqual("version-audit", self.handler())
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIn("cycle 2", directive["action"])

    def test_repeated_finding_reopens_remediation(self) -> None:
        self.fixture.write_audit("Approved", "Delivered")
        self.assertEqual("audit-ready", self.stage())
        self.fixture.write_audit("Remediation required", "Open")
        self.assertEqual("audit-remediation-plan-needed", self.stage())

    def test_clean_complete_audit_can_archive(self) -> None:
        self.fixture.write_audit("Complete", "Verified")
        self.assertEqual("archive-needed", self.stage())
        self.assertEqual("version-audit", self.handler())

    def test_stale_procedure_requires_plan_reconciliation(self) -> None:
        self.fixture.write_audit("Remediation required", "Open", digest="0" * 64)
        before = (self.fixture.docs / "version-audits/9.9/PLAN.md").read_text(encoding="utf-8")
        self.assertEqual("audit-plan-needed", self.stage())
        self.assertEqual("plan-version-audit", self.handler())
        after = (self.fixture.docs / "version-audits/9.9/PLAN.md").read_text(encoding="utf-8")
        self.assertEqual(before, after)

    def test_missing_contracts_route_to_version_planning(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.assertEqual("contracts-needed", self.stage())
        self.assertEqual("plan-version", self.handler())

    def test_missing_master_plan_pauses_for_product_direction(self) -> None:
        (self.fixture.docs / "VERSION_9_9_PLAN.md").unlink()
        state = self.resolved()
        self.assertEqual("master-plan-needed", state["stage"])
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIsNone(directive["handler"])
        self.assertEqual("report", directive["mode"])

    def test_complete_audit_with_unresolved_finding_is_invalid(self) -> None:
        self.fixture.write_audit("Complete", "Delivered")
        state, errors = resolve(self.fixture.root)
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(errors)
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIsNone(directive["handler"])

    def test_nonterminal_roadmap_cannot_remain_remediation_required(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_audit("Remediation required", "Open")
        self.fixture.write_contract()
        state, errors = resolve(self.fixture.root)
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(errors)

    def test_in_progress_requires_actionable_work(self) -> None:
        self.fixture.write_audit("Remediation in progress")
        state, errors = resolve(self.fixture.root)
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(errors)


if __name__ == "__main__":
    unittest.main()
