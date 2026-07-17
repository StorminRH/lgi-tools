#!/usr/bin/env python3
"""Fixture tests for PR title and body privacy scrubbing."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

from scrub_pr_body import PatternRule, _runtime_rules, collect_findings


SCRIPT = Path(__file__).with_name("scrub_pr_body.py")


class PrivacyFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, rel_path: str, text: str) -> Path:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def messages(
        self,
        body: str,
        *,
        title: str | None = None,
        runtime_rules: list[PatternRule] | None = None,
    ) -> list[str]:
        body_path = self.write("candidate.md", body)
        args = argparse.Namespace(body_file=body_path, title=title)
        rules = [] if runtime_rules is None else runtime_rules
        return [
            finding.render()
            for finding in collect_findings(self.root, args, runtime_rules=rules)
        ]


class ScrubPrBodyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = PrivacyFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_generic_email_path_and_token_are_red(self) -> None:
        messages = self.fixture.messages(
            "Contact dev@example.com\n"
            "Built at /Users/example/project\n"
            "Staged in /private/tmp/release\n"
            "Token ghp_abcdefghijklmnopqrstuvwxyz\n"
        )
        self.assertEqual(4, len(messages))
        self.assertIn("email address", messages[0])
        self.assertIn("local absolute path", messages[1])
        self.assertIn("local absolute path", messages[2])
        self.assertIn("credential-shaped token", messages[3])

    def test_runtime_identifiers_are_injected_deterministically(self) -> None:
        rules = _runtime_rules(
            self.fixture.root,
            environ={"USER": "fixtureuser", "HOME": "/Users/fixturehome"},
            hostname="fixture-mac",
            git_values=("Fixture Person", "fixture@example.test"),
        )
        messages = self.fixture.messages(
            "Reviewed by Fixture Person on fixture-mac\n",
            runtime_rules=rules,
        )
        self.assertEqual(1, len(messages))
        self.assertIn("operator or machine identifier", messages[0])

    def test_local_extension_and_absent_file_are_supported(self) -> None:
        self.assertEqual([], self.fixture.messages("Public release notes only.\n"))
        self.fixture.write(
            ".agent-local/pr-privacy-local-patterns.txt",
            "# local handle\nprivate-handle\n",
        )
        messages = self.fixture.messages("Thanks private-handle\n")
        self.assertEqual(1, len(messages))
        self.assertIn("local operator identifier", messages[0])

    def test_invalid_local_regex_is_red(self) -> None:
        self.fixture.write(".agent-local/pr-privacy-local-patterns.txt", "[invalid\n")
        self.assertTrue(
            any(
                "invalid local privacy regex" in message
                for message in self.fixture.messages("Public text\n")
            )
        )

    def test_title_is_scanned(self) -> None:
        rules = [
            PatternRule(
                "operator or machine identifier",
                re.compile("private", re.IGNORECASE),
            )
        ]
        messages = self.fixture.messages(
            "Public body\n",
            title="Private release",
            runtime_rules=rules,
        )
        self.assertEqual(1, len(messages))
        self.assertTrue(messages[0].startswith("candidate.md#title:1:"))
        self.assertIn("PR title contains", messages[0])

    def test_check_mode_blocks_seeded_identifier(self) -> None:
        body_path = self.fixture.write("candidate.md", "Contact dev@example.com\n")
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--root",
                str(self.fixture.root),
                "--body-file",
                str(body_path),
                "--check",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, result.returncode)


if __name__ == "__main__":
    unittest.main()
