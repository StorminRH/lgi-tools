#!/usr/bin/env python3
"""Fixture tests for release-consistency verification."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from check_release_consistency import collect_findings


SCRIPT = Path(__file__).with_name("check_release_consistency.py")


class ReleaseFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, rel_path: str, text: str) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def seed(self, app_version: str, changelog_versions: list[str], statuses: list[tuple[str, str]]) -> None:
        self.write(
            "src/config/app-version.ts",
            f"export const APP_VERSION = '{app_version}';\n",
        )
        self.write(
            "content/changelog/v9.9.md",
            "## v9.9 — Fixture\n\n"
            + "\n".join(
                f"### v{version} — 2026-07-16\n" for version in changelog_versions
            ),
        )
        rows = "\n".join(
            f"| {version} | Fixture | 1 | {status} |" for version, status in statuses
        )
        self.write(
            "docs/VERSION_9_9_PLAN.md",
            "# Fixture\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            f"{rows}\n",
        )

    def messages(self, expect: str | None = None) -> list[str]:
        args = argparse.Namespace(expect=expect)
        return [finding.render() for finding in collect_findings(self.root, args)]


class ReleaseConsistencyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ReleaseFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_pre_pr_signature_is_clean(self) -> None:
        self.fixture.seed(
            "9.9.1.3",
            ["9.9.1.3", "9.9.1.2"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        self.assertEqual([], self.fixture.messages("pre-pr"))

    def test_reconciled_signature_is_clean(self) -> None:
        self.fixture.seed(
            "9.9.1.2",
            ["9.9.1.2", "9.9.1.1"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        self.assertEqual([], self.fixture.messages("reconciled"))

    def test_truthful_release_candidate_pr_is_clean(self) -> None:
        # A planned final PR is authored in the reconciled state: the delivered
        # sub-version's row is already terminal and APP_VERSION matches it, while
        # later planned sub-versions stay nonterminal. It passes the gate the final
        # PR now uses (--expect reconciled) and is correctly NOT pre-pr, which is
        # why post-merge reconciliation is no longer needed.
        self.fixture.seed(
            "9.9.1.2",
            ["9.9.1.2", "9.9.1.1"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        self.assertEqual([], self.fixture.messages("reconciled"))
        self.assertTrue(
            any(
                "release state is reconciled, expected pre-pr" in message
                for message in self.fixture.messages("pre-pr")
            )
        )

    def test_pending_fragments_do_not_perturb_release_identity(self) -> None:
        # The pending inbox is neutral to release consistency: fragment files under
        # content/changelog/pending/ never change the version triplet.
        self.fixture.seed(
            "9.9.1.2",
            ["9.9.1.2", "9.9.1.1"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        self.fixture.write(
            "content/changelog/pending/2026-07-22-fix.md",
            "---\ndate: 2026-07-22\n---\n\n#### Fixed\n- An out-of-band fix.\n",
        )
        self.assertEqual([], self.fixture.messages())
        self.assertEqual([], self.fixture.messages("reconciled"))

    def test_expect_pins_the_required_signature(self) -> None:
        self.fixture.seed(
            "9.9.1.2",
            ["9.9.1.2"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        self.assertTrue(
            any("release state is reconciled, expected pre-pr" in message for message in self.fixture.messages("pre-pr"))
        )

    def test_version_changelog_mismatch_is_red(self) -> None:
        self.fixture.seed(
            "9.9.1.3",
            ["9.9.1.2"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        messages = self.fixture.messages()
        self.assertTrue(any("changelog entry missing" in message for message in messages))
        self.assertFalse(any("does not match newest changelog" in message for message in messages))

    def test_existing_older_entry_reports_newest_heading_mismatch(self) -> None:
        self.fixture.seed(
            "9.9.1.2",
            ["9.9.1.3", "9.9.1.2"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        self.assertTrue(
            any(
                "does not match newest changelog" in message
                for message in self.fixture.messages()
            )
        )

    def test_terminal_row_after_nonterminal_is_red(self) -> None:
        self.fixture.seed(
            "9.9.1.2",
            ["9.9.1.2"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "PLANNED"), ("9.9.1.3", "SHIPPED")],
        )
        self.assertTrue(any("terminal prefix" in message for message in self.fixture.messages()))

    def test_opening_transient_is_clean(self) -> None:
        # New version opened: all rows planned, APP_VERSION still on the previous
        # version, no changelog entry yet. --check is clean; --expect still pins.
        self.fixture.seed(
            "9.8.1.5",
            [],
            [("9.9.1.1", "PLANNED"), ("9.9.1.2", "PLANNED")],
        )
        self.assertEqual([], self.fixture.messages())
        self.assertTrue(
            any(
                "release state is opening, expected reconciled" in message
                for message in self.fixture.messages("reconciled")
            )
        )

    def test_missing_changelog_for_current_version_is_red(self) -> None:
        # APP_VERSION already names the active version but its changelog is missing:
        # a real contradiction, not the opening transient.
        self.fixture.seed(
            "9.9.1.1",
            [],
            [("9.9.1.1", "PLANNED")],
        )
        self.assertTrue(
            any("missing parseable changelog entry" in message for message in self.fixture.messages())
        )

    def test_check_mode_blocks_seeded_mismatch(self) -> None:
        self.fixture.seed(
            "9.9.1.3",
            ["9.9.1.2"],
            [("9.9.1.1", "SHIPPED"), ("9.9.1.2", "SHIPPED"), ("9.9.1.3", "PLANNED")],
        )
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.fixture.root), "--check"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, result.returncode)


if __name__ == "__main__":
    unittest.main()
