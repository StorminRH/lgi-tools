#!/usr/bin/env python3
"""Seeded contradiction fixtures for the lifecycle-evidence checker."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tools.lifecycle.check_lifecycle_evidence import collect_findings

class LifecycleFixture:
    def __init__(self, version: str = "9.9") -> None:
        self.version = version
        self.session = f"{version}.1.1"
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.docs = self.root / "docs"
        self.docs.mkdir()
        self.write_roadmap("PLANNED")
        self.contract = self.write_contract()
        self.write_plan("Pending")
        manifest = self.root / "tools/policy/policy-manifest.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps(
                {
                    "developmentState": {
                        "legacySchemaArtifacts": [
                            f"docs/session-contracts/{version}/{self.session}.md",
                            f"docs/session-plans/{version}/{self.session}.md",
                        ]
                    }
                }
            ),
            encoding="utf-8",
        )
    def close(self) -> None:
        self.temporary.cleanup()

    def write_roadmap(self, status: str, theme: str = "Fixture") -> None:
        (self.docs / f"VERSION_{self.version.replace('.', '_')}_PLAN.md").write_text(
            f"# Version {self.version}\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            f"| {self.session} | {theme} | 1 | {status} |\n",
            encoding="utf-8",
        )

    def write_contract(self) -> Path:
        directory = self.docs / "session-contracts" / self.version
        directory.mkdir(parents=True)
        contract = directory / f"{self.session}.md"
        contract.write_text(
            f"## Session {self.session} — Fixture\n\n**UX gate:** No\n",
            encoding="utf-8",
        )
        (directory / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            f"| {self.session} | {self.session} | `{self.session}.md` |\n",
            encoding="utf-8",
        )
        return contract

    def write_plan(self, execution: str) -> None:
        directory = self.docs / "session-plans" / self.version
        directory.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(self.contract.read_bytes()).hexdigest()
        (directory / f"{self.session}.md").write_text(
            "# Plan\n\n"
            "**Plan status:** Approved\n"
            f"**Contract digest:** `sha256:{digest}`\n"
            f"**Execution status:** {execution}\n"
            "**Baseline effect:** Neutral\n",
            encoding="utf-8",
        )

class LifecycleEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = LifecycleFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def matching(self, text: str):
        matches = [
            finding
            for finding in collect_findings(self.fixture.root)
            if text in finding.message
        ]
        self.assertEqual(1, len(matches), [finding.render() for finding in matches])
        return matches[0]

    def test_legacy_complete_plan_with_open_roadmap_is_an_error(self) -> None:
        self.fixture.close()
        self.fixture = LifecycleFixture("4.0")
        self.fixture.write_plan("Complete")
        finding = self.matching("execution is Complete")
        self.assertEqual(("docs/session-plans/4.0/4.0.1.1.md", 5), (finding.path, finding.line))
        self.assertEqual("error", finding.severity)

    def test_development_complete_rows_can_await_archive(self) -> None:
        self.fixture.close()
        self.fixture = LifecycleFixture("4.1")
        self.fixture.write_plan("Complete")
        roadmap = self.fixture.docs / "VERSION_4_1_PLAN.md"
        roadmap.write_text(
            roadmap.read_text(encoding="utf-8")
            + "| 4.1.2.1 | Later completed work | 1 | PLANNED |\n",
            encoding="utf-8",
        )
        contract_directory = self.fixture.docs / "session-contracts/4.1"
        (contract_directory / "4.1.2.1.md").write_text(
            "## Session 4.1.2.1 — Later completed work\n\n**UX gate:** No\n",
            encoding="utf-8",
        )
        index = contract_directory / "INDEX.md"
        index.write_text(
            index.read_text(encoding="utf-8")
            + "| 4.1.2.1 | 4.1.2.1 | `4.1.2.1.md` |\n",
            encoding="utf-8",
        )
        plan_directory = self.fixture.docs / "session-plans/4.1"
        (plan_directory / "4.1.2.1.md").write_text(
            "# Plan\n\n**Execution status:** Complete\n",
            encoding="utf-8",
        )

        self.assertEqual([], collect_findings(self.fixture.root))

    def test_complete_early_session_with_later_session_remaining_is_valid(self) -> None:
        self.fixture.close()
        self.fixture = LifecycleFixture("4.0")
        self.fixture.write_plan("Complete")
        contract_directory = self.fixture.docs / "session-contracts/4.0"
        (contract_directory / "4.0.1.1.2.md").write_text(
            "## Session 4.0.1.1.2 — Fixture continuation\n\n**UX gate:** No\n",
            encoding="utf-8",
        )
        (contract_directory / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 4.0.1.1 | 4.0.1.1 | `4.0.1.1.md` |\n"
            "| 4.0.1.1.2 | 4.0.1.1 | `4.0.1.1.2.md` |\n",
            encoding="utf-8",
        )
        findings = collect_findings(self.fixture.root)
        self.assertFalse(
            any("execution is Complete" in finding.message for finding in findings),
            [finding.render() for finding in findings],
        )

    def test_terminal_roadmap_with_pending_plan_is_a_warning(self) -> None:
        self.fixture.write_roadmap("SHIPPED")
        finding = self.matching("execution remains Pending")
        self.assertEqual(("docs/session-plans/9.9/9.9.1.1.md", 5), (finding.path, finding.line))
        self.assertEqual("warn", finding.severity)

    def test_procedure_policies_require_ordered_schema_wording(self) -> None:
        schema = self.fixture.docs / "workflows/schema/session-plan.md"
        schema.parent.mkdir(parents=True)
        schema.write_text("Freeze\nLaunch\n", encoding="utf-8")
        manifest = self.fixture.root / "tools/policy/policy-manifest.json"
        manifest.write_text(
            json.dumps(
                {
                    "developmentState": {"legacySchemaArtifacts": []},
                    "procedurePolicies": {
                        "docs/workflows/schema/session-plan.md": {
                            "orderedRequired": ["Launch", "Freeze"]
                        }
                    },
                }
            ),
            encoding="utf-8",
        )
        finding = self.matching("missing ordered policy `Freeze`")
        self.assertEqual(
            ("docs/workflows/schema/session-plan.md", 1),
            (finding.path, finding.line),
        )
        self.assertEqual("error", finding.severity)

if __name__ == "__main__":
    unittest.main()
