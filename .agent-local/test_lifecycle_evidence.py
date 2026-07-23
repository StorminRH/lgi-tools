#!/usr/bin/env python3
"""Seeded contradiction fixtures for the lifecycle-evidence checker."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from check_lifecycle_evidence import collect_findings


class LifecycleFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.docs = self.root / "docs"
        self.docs.mkdir()
        self.write_roadmap("PLANNED")
        self.contract = self.write_contract()
        self.write_plan("Pending")
        manifest = self.root / ".agent-local/policy-manifest.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps(
                {
                    "developmentState": {
                        "legacySchemaArtifacts": [
                            "docs/session-contracts/9.9/9.9.1.1.md",
                            "docs/session-plans/9.9/9.9.1.1.md",
                        ]
                    }
                }
            ),
            encoding="utf-8",
        )
        self.write_scratchpad("9.9.1.1")
        self.write_baseline("")

    def close(self) -> None:
        self.temporary.cleanup()

    def write_roadmap(self, status: str, theme: str = "Fixture") -> None:
        (self.docs / "VERSION_9_9_PLAN.md").write_text(
            "# Version 9.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            f"| 9.9.1.1 | {theme} | 1 | {status} |\n",
            encoding="utf-8",
        )

    def write_contract(self) -> Path:
        directory = self.docs / "session-contracts/9.9"
        directory.mkdir(parents=True)
        contract = directory / "9.9.1.1.md"
        contract.write_text(
            "## Session 9.9.1.1 — Fixture\n\n**UX gate:** No\n",
            encoding="utf-8",
        )
        (directory / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 9.9.1.1 | 9.9.1.1 | `9.9.1.1.md` |\n",
            encoding="utf-8",
        )
        return contract

    def write_plan(self, execution: str) -> None:
        directory = self.docs / "session-plans/9.9"
        directory.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(self.contract.read_bytes()).hexdigest()
        (directory / "9.9.1.1.md").write_text(
            "# Plan\n\n"
            "**Plan status:** Approved\n"
            f"**Contract digest:** `sha256:{digest}`\n"
            f"**Execution status:** {execution}\n"
            "**Baseline effect:** Neutral\n",
            encoding="utf-8",
        )

    def write_scratchpad(self, session: str) -> None:
        (self.docs / "SCRATCHPAD.md").write_text(
            "# Scratchpad\n\n## Now\n\n"
            f"**NEXT = run {session}.**\n\n## Backlog\n",
            encoding="utf-8",
        )

    def write_baseline(self, body: str) -> None:
        (self.docs / "CODE_HEALTH_BASELINE.md").write_text(
            "# Baseline\n\n"
            f"{body}\n"
            "## Campaign queue\n\n"
            "| Priority | Campaign | Charter summary | Status | Trigger / next action |\n"
            "| ---: | --- | --- | --- | --- |\n",
            encoding="utf-8",
        )

    def write_audit(self, rows: list[str]) -> None:
        path = self.docs / "version-audits/9.9/PLAN.md"
        path.parent.mkdir(parents=True)
        path.write_text(
            "# Audit\n\n"
            "| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |\n"
            "| --- | ---: | --- | --- | --- | --- | --- |\n"
            + "".join(f"{row}\n" for row in rows),
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

    def test_complete_plan_with_open_roadmap_is_an_error(self) -> None:
        self.fixture.write_plan("Complete")
        finding = self.matching("execution is Complete")
        self.assertEqual(("docs/session-plans/9.9/9.9.1.1.md", 5), (finding.path, finding.line))
        self.assertEqual("error", finding.severity)

    def test_complete_early_session_with_later_session_remaining_is_valid(self) -> None:
        self.fixture.write_plan("Complete")
        contract_directory = self.fixture.docs / "session-contracts/9.9"
        (contract_directory / "9.9.1.1.2.md").write_text(
            "## Session 9.9.1.1.2 — Fixture continuation\n\n**UX gate:** No\n",
            encoding="utf-8",
        )
        (contract_directory / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 9.9.1.1 | 9.9.1.1 | `9.9.1.1.md` |\n"
            "| 9.9.1.1.2 | 9.9.1.1 | `9.9.1.1.2.md` |\n",
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

    def test_scratchpad_now_mismatch_is_a_warning(self) -> None:
        self.fixture.write_scratchpad("9.9.9.9")
        finding = self.matching("SCRATCHPAD Now does not name")
        self.assertEqual(("docs/SCRATCHPAD.md", 3), (finding.path, finding.line))
        self.assertEqual("warn", finding.severity)

    def test_watch_and_trigger_asymmetry_is_an_error(self) -> None:
        self.fixture.write_baseline("| Surface | Watch (AF-001) |\n")
        finding = self.matching("Watch classification AF-001 has no watch-trigger")
        self.assertEqual(("docs/CODE_HEALTH_BASELINE.md", 3), (finding.path, finding.line))
        self.assertEqual("error", finding.severity)

    def test_verified_audit_finding_cannot_keep_live_watch_evidence(self) -> None:
        self.fixture.write_roadmap("SHIPPED")
        self.fixture.write_plan("Complete")
        self.fixture.write_baseline(
            "| Surface | Watch (AF-001) |\n\n"
            "```watch-trigger\nAF-001: exports(src/example.ts) >= 1\n```\n"
        )
        self.fixture.write_audit(
            ["| AF-001 | 1 | Campaign | leak | one owner | 9.9.1.1 | Verified |"]
        )
        finding = self.matching("Verified but baseline still carries active evidence")
        self.assertEqual(("docs/CODE_HEALTH_BASELINE.md", 3), (finding.path, finding.line))
        self.assertEqual("error", finding.severity)

    def test_terminal_remediation_with_open_finding_is_an_error(self) -> None:
        self.fixture.write_roadmap("SHIPPED", "AF-001 owner")
        self.fixture.write_plan("Complete")
        self.fixture.write_audit(
            ["| AF-001 | 1 | Campaign | leak | one owner | 9.9.1.1 | Open |"]
        )
        finding = self.matching("AF-001 remains Open")
        self.assertEqual(("docs/VERSION_9_9_PLAN.md", 7), (finding.path, finding.line))
        self.assertEqual("error", finding.severity)

    def test_delivered_finding_with_open_roadmap_is_a_warning(self) -> None:
        self.fixture.write_audit(
            ["| AF-001 | 1 | Campaign | leak | one owner | 9.9.1.1 | Delivered |"]
        )
        finding = self.matching("Delivered while roadmap 9.9.1.1 is PLANNED")
        self.assertEqual(("docs/version-audits/9.9/PLAN.md", 5), (finding.path, finding.line))
        self.assertEqual("warn", finding.severity)


if __name__ == "__main__":
    unittest.main()
