#!/usr/bin/env python3
"""Fixture tests for the agent-policy drift checker."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from check_agent_drift import check_paths, check_session_contracts, check_skill_pairs


class DriftFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.manifest = {
            "policyRevision": 19,
            "canonicalGuides": ["AGENTS.md"],
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
                }
            },
            "runtimeForbidden": {
                "codex": ["claude-only"],
                "claude": ["codex-only"],
            },
            "sessionContracts": {
                "scan": ["docs/SESSION_CONTRACTS.md"],
                "forbidden": ["retired contract policy"],
            },
        }
        self.write("AGENTS.md", "guide\n")
        self.write(".agent-local/check_agent_drift.py", "checker\n")
        self.write("docs/SESSION_CONTRACTS.md", "contract standard\n")
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

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, raw_path: str, text: str) -> None:
        path = self.root / raw_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_skill(self, runtime: str, body: str = "load-bearing") -> None:
        self.write(
            f".{runtime if runtime == 'claude' else 'agents'}/skills/demo/SKILL.md",
            "---\n"
            "name: demo\n"
            "description: Fixture skill.\n"
            "---\n"
            "<!-- shared-policy-revision: 19 -->\n"
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

    def test_affected_checks_accept_the_passing_fixture(self) -> None:
        self.assertEqual([], self.check_paths())
        self.assertEqual([], self.check_skills())
        self.assertEqual([], self.check_contracts())

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

    def test_skill_bodies_report_a_missing_revision_marker(self) -> None:
        path = self.fixture.root / ".agents/skills/demo/SKILL.md"
        path.write_text(
            path.read_text(encoding="utf-8").replace(
                "<!-- shared-policy-revision: 19 -->\n", ""
            ),
            encoding="utf-8",
        )
        self.assertIn(
            ".agents/skills/demo/SKILL.md: missing marker "
            "<!-- shared-policy-revision: 19 -->",
            self.check_skills(),
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


if __name__ == "__main__":
    unittest.main()
