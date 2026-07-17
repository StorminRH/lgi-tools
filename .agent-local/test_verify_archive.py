#!/usr/bin/env python3
"""Fixture tests for archive-transition verification."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from verify_archive import collect_findings


AUDITED_REF = "a" * 40
SCRIPT = Path(__file__).with_name("verify_archive.py")


class ArchiveFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "repo"
        self.archive_root = Path(self.temporary.name) / "archive"
        self.seed()

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, rel_path: str, text: str) -> Path:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def seed(self) -> None:
        self.write(
            "docs/VERSION_9_9_PLAN.md",
            "# Fixture\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            "| 9.9.1.1 | Fixture | 1 | SHIPPED |\n",
        )
        self.write("docs/session-contracts/9.9/INDEX.md", "contract index\n")
        self.write("docs/session-contracts/9.9/9.9.1.1.md", "contract\n")
        self.write("docs/session-plans/9.9/9.9.1.1.md", "plan\n")
        self.write(
            "docs/version-audits/9.9/PLAN.md",
            "**Audit status:** Complete\n"
            "**Audit cycle:** 2\n"
            f"**Audited ref:** {AUDITED_REF}\n\n"
            "| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |\n"
            "| --- | ---: | --- | --- | --- | --- | --- |\n"
            "| AF-001 | 1 | Campaign | fixture | fixed | 9.9.1.1 | Verified |\n"
            "| AF-002 | 2 | Watch | pressure | watch | — | Watch |\n",
        )
        self.write(
            "docs/CODE_HEALTH_BASELINE.md",
            "# Baseline\n\n| Field | Value |\n| --- | --- |\n"
            "| App version | 9.9.1.1 |\n"
            f"| Code ref | `{AUDITED_REF}` on `main` |\n",
        )

    def messages(self, phase: str = "pre") -> list[str]:
        args = argparse.Namespace(phase=phase, archive_root=self.archive_root)
        return [finding.render() for finding in collect_findings(self.root, args)]

    def copy_bundle(self) -> Path:
        destination = self.archive_root / "versions/9.9"
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.root / "docs/VERSION_9_9_PLAN.md", destination)
        for name in ("session-contracts", "session-plans", "version-audits"):
            shutil.copytree(
                self.root / "docs" / name / "9.9",
                destination / name,
            )
        return destination


class VerifyArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ArchiveFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_clean_preconditions_are_green(self) -> None:
        self.assertEqual([], self.fixture.messages())

    def test_nonterminal_roadmap_is_red(self) -> None:
        self.fixture.write(
            "docs/VERSION_9_9_PLAN.md",
            "# Fixture\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            "| 9.9.1.1 | Fixture | 1 | PLANNED |\n",
        )
        self.assertTrue(any("not terminal" in message for message in self.fixture.messages()))

    def test_new_unverified_actionable_finding_is_red(self) -> None:
        audit = self.fixture.root / "docs/version-audits/9.9/PLAN.md"
        audit.write_text(
            audit.read_text(encoding="utf-8")
            + "| AF-003 | 2 | Floss | new | fix | — | Open |\n",
            encoding="utf-8",
        )
        messages = self.fixture.messages()
        self.assertTrue(any("is not Verified" in message for message in messages))
        self.assertTrue(any("current audit cycle" in message for message in messages))

    def test_post_reports_missing_and_differing_files(self) -> None:
        destination = self.fixture.copy_bundle()
        (destination / "session-plans/9.9.1.1.md").write_text(
            "different\n",
            encoding="utf-8",
        )
        (destination / "session-contracts/9.9.1.1.md").unlink()
        messages = self.fixture.messages("post")
        self.assertTrue(any("archive copy is missing" in message for message in messages))
        self.assertTrue(any("archive copy differs" in message for message in messages))

    def test_post_reports_missing_active_source_directory(self) -> None:
        shutil.rmtree(self.fixture.root / "docs/session-plans/9.9")
        self.assertTrue(
            any(
                "docs/session-plans/9.9:1: archive source set is missing or empty"
                in message
                for message in self.fixture.messages("post")
            )
        )

    def test_faithful_post_copy_is_green(self) -> None:
        self.fixture.copy_bundle()
        self.assertEqual([], self.fixture.messages("post"))

    def test_check_mode_blocks_seeded_missing_copy(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--root",
                str(self.fixture.root),
                "--archive-root",
                str(self.fixture.archive_root),
                "--phase",
                "post",
                "--check",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, result.returncode)


if __name__ == "__main__":
    unittest.main()
