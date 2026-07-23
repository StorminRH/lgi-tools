#!/usr/bin/env python3
"""Fixture tests for the agent-policy drift checker."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from check_agent_drift import (
    check_development_state,
    check_paths,
    check_procedure_policies,
    check_probe_layout,
    check_prose_ownership,
    check_session_contracts,
    check_skill_pairs,
    check_skill_reconciliation,
    ledger_digest,
)


class DriftFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.manifest = {
            "canonicalGuides": ["AGENTS.md", "docs/workflows/demo.md"],
            "requiredPaths": [".agent-local/check_agent_drift.py"],
            "forbiddenPaths": ["docs/retired.md"],
            "skillRoots": {
                "codex": ".agents/skills",
                "claude": ".claude/skills",
            },
            "pairedSkills": {
                "demo": {
                    "required": ["load-bearing"],
                    "forbidden": ["retired policy"],
                    "procedure": "docs/workflows/demo.md",
                }
            },
            "runtimeForbidden": {
                "codex": ["claude-only"],
                "claude": ["codex-only"],
            },
            "probeLayout": {
                "definitionsDir": "docs/ux-check/probes",
                "runner": "docs/ux-check/run-probes.mjs",
                "strayPattern": "*-probe.mjs",
            },
            "sessionContracts": {
                "scan": ["docs/workflows/schema/session-contract.md"],
                "forbidden": ["retired contract policy"],
            },
            "procedurePolicies": {
                "docs/workflows/demo.md": {
                    "orderedRequired": ["first checkpoint", "second checkpoint"],
                }
            },
            "proseOwnership": {
                "paths": ["AGENTS.md", "docs/workflows/demo.md"],
                "minimumWords": 8,
                "exceptions": [],
            },
        }
        self.write("AGENTS.md", "guide\n")
        self.write(
            "docs/workflows/demo.md",
            "# Demonstration procedure\n\n"
            "Complete the first checkpoint before the second checkpoint.\n",
        )
        self.write(".agent-local/check_agent_drift.py", "checker\n")
        self.write("docs/workflows/schema/session-contract.md", "contract standard\n")
        self.write("docs/ux-check/run-probes.mjs", "runner\n")
        self.write("docs/ux-check/probes/example.mjs", "export default {};\n")
        self.write(
            "docs/VERSION_3_9_PLAN.md",
            "# Version 3.9\n\n"
            "## Status\n\n"
            "| Sub-version | Status |\n"
            "| --- | --- |\n"
            "| 3.9.1.6 | PLANNED |\n",
        )
        self.write(
            "docs/session-contracts/3.9/INDEX.md",
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 3.9.1.6 | 3.9.1.6 | `3.9.1.6.md` |\n",
        )
        self.write(
            "docs/session-contracts/3.9/3.9.1.6.md",
            "## Session 3.9.1.6 — Fixture\n",
        )
        self.write_skill("codex")
        self.write_skill("claude")
        self.manifest["skillReconciliation"] = {
            "demo": {
                "deps": ["AGENTS.md"],
                "reconciledHash": ledger_digest(self.root, ["AGENTS.md"]),
            }
        }

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, raw_path: str, text: str) -> None:
        path = self.root / raw_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_skill(
        self,
        runtime: str,
        body: str = (
            "Follow docs/workflows/demo.md.\n\n"
            "Invocation authority is fixture-scoped.\n\n"
            "Use runtime mechanics.\n\n"
            "Return the result.\n\n"
            "load-bearing"
        ),
    ) -> None:
        self.write(
            f".{runtime if runtime == 'claude' else 'agents'}/skills/demo/SKILL.md",
            "---\n"
            "name: demo\n"
            "description: Fixture skill.\n"
            "---\n"
            f"{body}\n",
        )


class AgentDriftTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = DriftFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def check_paths(self) -> list[str]:
        errors: list[str] = []
        check_paths(self.fixture.manifest, self.fixture.root, errors)
        return errors

    def check_skills(self) -> list[str]:
        errors: list[str] = []
        check_skill_pairs(self.fixture.manifest, self.fixture.root, errors)
        return errors

    def check_contracts(self) -> list[str]:
        errors: list[str] = []
        check_session_contracts(self.fixture.manifest, self.fixture.root, errors)
        return errors

    def check_probes(self) -> list[str]:
        return check_probe_layout(self.fixture.manifest, self.fixture.root)

    def check_procedures(self) -> list[str]:
        errors: list[str] = []
        check_procedure_policies(self.fixture.manifest, self.fixture.root, errors)
        return errors

    def check_prose(self) -> list[str]:
        errors: list[str] = []
        check_prose_ownership(self.fixture.manifest, self.fixture.root, errors)
        return errors

    def check_reconciliation(self) -> list[str]:
        errors: list[str] = []
        check_skill_reconciliation(self.fixture.manifest, self.fixture.root, errors)
        return errors

    def test_affected_checks_accept_the_passing_fixture(self) -> None:
        self.assertEqual([], self.check_paths())
        self.assertEqual([], self.check_skills())
        self.assertEqual([], self.check_contracts())
        self.assertEqual([], self.check_probes())
        self.assertEqual([], self.check_procedures())
        self.assertEqual([], self.check_prose())
        self.assertEqual([], self.check_reconciliation())

    def test_paths_report_missing_and_retired_entries(self) -> None:
        (self.fixture.root / "AGENTS.md").unlink()
        self.fixture.write("docs/retired.md", "retired\n")
        self.assertEqual(
            [
                "missing required path: AGENTS.md",
                "retired path still exists: docs/retired.md",
            ],
            self.check_paths(),
        )

    def test_paths_derive_required_skill_files(self) -> None:
        (self.fixture.root / ".agents/skills/demo/SKILL.md").unlink()
        self.assertIn(
            "missing required path: .agents/skills/demo/SKILL.md",
            self.check_paths(),
        )

    def test_skill_sets_report_missing_and_extra_directories(self) -> None:
        (self.fixture.root / ".agents/skills/demo/SKILL.md").unlink()
        self.fixture.write(".agents/skills/extra/SKILL.md", "extra\n")
        errors = self.check_skills()
        self.assertIn(
            "codex skill set mismatch: expected ['demo'], found ['extra']",
            errors,
        )
        self.assertIn("missing file: .agents/skills/demo/SKILL.md", errors)

    def test_skill_bodies_report_marker_phrase_and_runtime_drift(self) -> None:
        self.fixture.write_skill(
            "codex",
            "retired policy\nclaude-only",
        )
        errors = self.check_skills()
        self.assertIn(
            ".agents/skills/demo/SKILL.md: missing required policy /load-bearing/",
            errors,
        )
        self.assertIn(
            ".agents/skills/demo/SKILL.md: contains stale policy /retired policy/",
            errors,
        )
        self.assertIn(
            ".agents/skills/demo/SKILL.md: contains wrong-runtime language /claude-only/",
            errors,
        )

    def test_skill_bodies_require_the_exact_canonical_procedure_once(self) -> None:
        self.fixture.write_skill(
            "codex",
            "load-bearing\nInvocation authority\nruntime mechanics\nReturn",
        )
        self.assertIn(
            ".agents/skills/demo/SKILL.md: must point to docs/workflows/demo.md exactly once",
            self.check_skills(),
        )

        self.fixture.write_skill(
            "codex",
            "docs/workflows/demo.md docs/workflows/demo.md\n"
            "load-bearing\nInvocation authority\nruntime mechanics\nReturn",
        )
        self.assertIn(
            ".agents/skills/demo/SKILL.md: must point to docs/workflows/demo.md exactly once",
            self.check_skills(),
        )

    def test_procedure_checkpoints_must_remain_in_order(self) -> None:
        self.fixture.write(
            "docs/workflows/demo.md",
            "Complete the second checkpoint before the first checkpoint.\n",
        )
        self.assertEqual(
            [
                "docs/workflows/demo.md: missing or reordered procedure checkpoint "
                "/second checkpoint/"
            ],
            self.check_procedures(),
        )

    def test_procedure_checkpoints_report_every_missing_pattern(self) -> None:
        self.fixture.manifest["procedurePolicies"]["docs/workflows/demo.md"][
            "orderedRequired"
        ] = ["first checkpoint", "second checkpoint", "third checkpoint"]
        self.fixture.write(
            "docs/workflows/demo.md",
            "Complete the first checkpoint.\n",
        )
        self.assertEqual(
            [
                "docs/workflows/demo.md: missing or reordered procedure checkpoint "
                "/second checkpoint/",
                "docs/workflows/demo.md: missing or reordered procedure checkpoint "
                "/third checkpoint/",
            ],
            self.check_procedures(),
        )

    def test_normalized_prose_duplicates_are_sorted_and_substantive(self) -> None:
        self.fixture.manifest["proseOwnership"]["paths"] = [
            "docs/zeta.md",
            "docs/alpha.md",
        ]
        self.fixture.write(
            "docs/zeta.md",
            "Agents MUST preserve the approved ownership_boundary, every time.\n",
        )
        self.fixture.write(
            "docs/alpha.md",
            "Agents must preserve—the approved ownership boundary every time!\n",
        )
        self.assertEqual(
            [
                "duplicate normative prose [agents must preserve the approved ownership "
                "boundary every time]: docs/alpha.md:1, docs/zeta.md:1"
            ],
            self.check_prose(),
        )

    def test_prose_scan_ignores_headings_fences_and_short_labels(self) -> None:
        self.fixture.manifest["proseOwnership"]["paths"] = [
            "docs/one.md",
            "docs/two.md",
        ]
        shared = (
            "# Agents must preserve the approved ownership boundary every time\n\n"
            "```text\nAgents must preserve the approved ownership boundary every time.\n```\n\n"
            "Short label.\n"
        )
        self.fixture.write("docs/one.md", shared)
        self.fixture.write("docs/two.md", shared)
        self.assertEqual([], self.check_prose())

    def test_prose_scan_keeps_dash_prefixed_sentences(self) -> None:
        sentence = "--- Agents must preserve the approved ownership boundary every time."
        self.fixture.manifest["proseOwnership"]["paths"] = [
            "docs/one.md",
            "docs/two.md",
        ]
        self.fixture.write("docs/one.md", f"{sentence}\n")
        self.fixture.write("docs/two.md", f"{sentence}\n")
        self.assertEqual(
            [
                "duplicate normative prose [agents must preserve the approved ownership "
                "boundary every time]: docs/one.md:1, docs/two.md:1"
            ],
            self.check_prose(),
        )

    def test_exact_prose_exception_requires_sentence_paths_and_reason(self) -> None:
        sentence = "Agents must preserve the approved ownership boundary every time."
        self.fixture.manifest["proseOwnership"]["paths"] = [
            "docs/one.md",
            "docs/two.md",
        ]
        self.fixture.manifest["proseOwnership"]["exceptions"] = [
            {
                "sentence": sentence,
                "paths": ["docs/two.md", "docs/one.md"],
                "reason": "Required adapter boilerplate.",
            }
        ]
        self.fixture.write("docs/one.md", f"{sentence}\n")
        self.fixture.write("docs/two.md", f"{sentence}\n")
        self.assertEqual([], self.check_prose())

    def test_prose_exception_requires_two_distinct_paths(self) -> None:
        self.fixture.manifest["proseOwnership"]["exceptions"] = [
            {
                "sentence": "Agents must preserve the approved ownership boundary.",
                "paths": ["docs/one.md", "docs/one.md"],
                "reason": "Invalid duplicate path fixture.",
            }
        ]
        self.assertEqual(
            [
                "proseOwnership exception requires sentence, at least two exact paths, "
                "and reason"
            ],
            self.check_prose(),
        )

    def test_reconciliation_flags_a_skill_stale_against_its_deps(self) -> None:
        # A changed policy dep moves the digest and flags the skill until restamped.
        self.fixture.write("AGENTS.md", "guide changed\n")
        self.assertTrue(
            any(
                "demo: skill is stale against its policy deps" in error
                for error in self.check_reconciliation()
            )
        )

    def test_reconciliation_reports_a_missing_ledger_entry(self) -> None:
        self.fixture.manifest["skillReconciliation"] = {}
        self.assertIn(
            "skillReconciliation is missing an entry for demo",
            self.check_reconciliation(),
        )

    def test_reconciliation_rejects_a_noncanonical_dep(self) -> None:
        self.fixture.manifest["skillReconciliation"]["demo"]["deps"] = ["docs/random.md"]
        self.assertTrue(
            any(
                "dep is not a canonical guide" in error
                for error in self.check_reconciliation()
            )
        )

    def test_contracts_report_each_existing_violation_class(self) -> None:
        contract_path = "docs/session-contracts/3.9/3.9.1.6.md"
        cases = {
            "wrong heading": (
                "## Session wrong — Fixture\n",
                f"{contract_path}: first heading must identify Session 3.9.1.6",
            ),
            "stray phase": (
                "## Session 3.9.1.6 — Fixture\n# Phase One\n",
                f"{contract_path}: contains a stray phase heading from the archive",
            ),
            "forbidden phrase": (
                "## Session 3.9.1.6 — Fixture\nretired contract policy\n",
                f"{contract_path}: contains stale session-contract policy "
                "/retired contract policy/",
            ),
        }
        for label, (text, expected) in cases.items():
            with self.subTest(label=label):
                self.fixture.write(contract_path, text)
                self.assertIn(expected, self.check_contracts())

    def test_contracts_report_an_expected_file_that_is_missing(self) -> None:
        (self.fixture.root / "docs/session-contracts/3.9/3.9.1.6.md").unlink()
        self.assertIn(
            "missing session contract: docs/session-contracts/3.9/3.9.1.6.md",
            self.check_contracts(),
        )

    def test_contracts_report_an_unindexed_orphan(self) -> None:
        self.fixture.write(
            "docs/session-contracts/3.9/3.9.1.7.md",
            "## Session 3.9.1.7 — Orphan\n",
        )
        self.assertIn(
            "unindexed session contract: docs/session-contracts/3.9/3.9.1.7.md",
            self.check_contracts(),
        )

    def test_contract_derivation_allows_no_active_version(self) -> None:
        (self.fixture.root / "docs/VERSION_3_9_PLAN.md").unlink()
        self.assertEqual([], self.check_contracts())

    def test_contract_derivation_allows_no_index(self) -> None:
        (self.fixture.root / "docs/session-contracts/3.9/INDEX.md").unlink()
        (self.fixture.root / "docs/session-contracts/3.9/3.9.1.6.md").unlink()
        self.assertEqual([], self.check_contracts())

    def test_probe_layout_warns_about_a_stray_scratch_script(self) -> None:
        self.fixture.write("tmp/foo-probe.mjs", "scratch\n")
        self.assertEqual(
            [
                "stray probe script (scratch allowed; delete at close-out): "
                "tmp/foo-probe.mjs"
            ],
            self.check_probes(),
        )

    def test_probe_layout_allows_definitions_and_prunes_generated_trees(self) -> None:
        self.fixture.write("docs/ux-check/probes/legacy-probe.mjs", "definition\n")
        self.fixture.write("docs/ux-check/captures/generated-probe.mjs", "capture\n")
        self.fixture.write("node_modules/package-probe.mjs", "dependency\n")
        self.assertEqual([], self.check_probes())

    def test_dispatchable_directive_requires_the_manifest_gate(self) -> None:
        manifest = {
            "pairedSkills": {"start-session": {}},
            "developmentState": {
                "resolver": ".agent-local/resolve_development_state.py",
                "allowedStages": ["session-ready"],
                "allowedHandlers": ["start-session"],
                "allowedModes": ["execute"],
                "directiveFields": [
                    "action",
                    "reason",
                    "handler",
                    "mode",
                    "authority",
                    "primaryArtifact",
                    "pause",
                    "preDispatchGate",
                ],
                "preDispatchGate": "release gate",
            },
        }
        directive = {
            "action": "Execute",
            "reason": "Ready",
            "handler": "start-session",
            "mode": "execute",
            "authority": "Approved plan",
            "primaryArtifact": "plan.md",
            "pause": "On conflict",
            "preDispatchGate": None,
        }
        result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"stage": "session-ready", "directive": directive}),
            stderr="",
        )
        errors: list[str] = []
        with patch("check_agent_drift.subprocess.run", return_value=result):
            check_development_state(manifest, errors)
        self.assertIn(
            "development state directive preDispatchGate must be 'release gate' "
            "when handler is 'start-session'",
            errors,
        )

    def test_operator_stop_requires_a_null_predispatch_gate(self) -> None:
        manifest = {
            "pairedSkills": {},
            "developmentState": {
                "resolver": ".agent-local/resolve_development_state.py",
                "allowedStages": ["contract-repair-needed"],
                "allowedHandlers": [],
                "allowedModes": ["report"],
                "directiveFields": [
                    "action",
                    "reason",
                    "handler",
                    "mode",
                    "authority",
                    "primaryArtifact",
                    "pause",
                    "preDispatchGate",
                ],
                "preDispatchGate": "release gate",
            },
        }
        directive = {
            "action": "Repair",
            "reason": "Invalid contract",
            "handler": None,
            "mode": "report",
            "authority": "Repair only",
            "primaryArtifact": "contract.md",
            "pause": "Repair required",
            "preDispatchGate": "release gate",
        }
        result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {"stage": "contract-repair-needed", "directive": directive}
            ),
            stderr="",
        )
        errors: list[str] = []
        with patch("check_agent_drift.subprocess.run", return_value=result):
            check_development_state(manifest, errors)
        self.assertIn(
            "development state directive preDispatchGate must be None when handler is None",
            errors,
        )


if __name__ == "__main__":
    unittest.main()
