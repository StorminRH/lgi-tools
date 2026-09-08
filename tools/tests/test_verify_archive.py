#!/usr/bin/env python3
"""Fixture tests for archive-transition verification."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools._lib.repository import ROOT
from tools.lifecycle.verify_archive import collect_findings

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
        self.write("docs/session-as-built/9.9/9.9.1.1.md", "as-built\n")

    def messages(self, phase: str = "pre") -> list[str]:
        args = argparse.Namespace(phase=phase, archive_root=self.archive_root)
        return [finding.render() for finding in collect_findings(self.root, args)]

    def copy_bundle(self) -> Path:
        destination = self.archive_root / "versions/9.9"
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.root / "docs/VERSION_9_9_PLAN.md", destination)
        for name in ("session-contracts", "session-plans", "session-as-built"):
            source = self.root / "docs" / name / "9.9"
            if source.is_dir():
                shutil.copytree(source, destination / name)
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

    def test_post_reports_corrupted_as_built_copy(self) -> None:
        destination = self.fixture.copy_bundle()
        (destination / "session-as-built/9.9.1.1.md").write_text(
            "tampered\n",
            encoding="utf-8",
        )
        self.assertTrue(
            any("archive copy differs" in message for message in self.fixture.messages("post"))
        )

    def test_post_reports_missing_as_built_copy(self) -> None:
        destination = self.fixture.copy_bundle()
        (destination / "session-as-built/9.9.1.1.md").unlink()
        self.assertTrue(
            any("archive copy is missing" in message for message in self.fixture.messages("post"))
        )

    def test_post_allows_a_missing_as_built_directory(self) -> None:
        shutil.rmtree(self.fixture.root / "docs/session-as-built/9.9")
        self.fixture.copy_bundle()
        shutil.rmtree(self.fixture.archive_root / "versions/9.9/session-as-built", ignore_errors=True)
        messages = self.fixture.messages("post")
        self.assertFalse(
            any("session-as-built" in message and "missing or empty" in message for message in messages)
        )

    def test_faithful_post_copy_is_green(self) -> None:
        self.fixture.copy_bundle()
        self.assertEqual([], self.fixture.messages("post"))

    def test_both_archive_phases_enforce_historical_review_authorization(self) -> None:
        from tools.delivery.records import fields
        from tools.tests import test_delivery_receipts as receipts
        from tools.tests.test_delivery_records import candidate

        record = candidate(self.fixture.root)
        subject = receipts.ReceiptTests()
        subject.setUp()
        receipt, source = subject.receipt, subject.source
        receipt.update(delivery_id=fields(record)["Delivery ID"], stage="promoted", merge_sha="d" * 40,
                       deployment={"id": 200, "sha": "d" * 40, "environment": "staging", "state": "success"})
        source["pr"].update(merged=True, merge_commit_sha="d" * 40)
        source.update(merge={"sha": "d" * 40, "parents": [{"sha": receipts.BASE}]}, merge_ref_valid=True, deployment=receipt["deployment"])
        comment = {"id": "archive-comment", "issue": {"identifier": "LGI-119"}, "body": "```lgi-delivery-receipt\n" + json.dumps(receipt) + "\n```"}
        self.fixture.write(f"receipts/{receipt['delivery_id']}.json", json.dumps({"comment_id": comment["id"], "comment": comment, "stage": "promoted"}))
        self.fixture.copy_bundle()
        for phase in ("pre", "post"):
            args = argparse.Namespace(phase=phase, archive_root=self.fixture.archive_root, receipt_dir=self.fixture.root / "receipts")
            for author_id, expected in ((101, False), (999, True)):
                source["reviews"][0]["user"]["id"] = author_id
                with self.subTest(phase=phase, author_id=author_id), patch("tools.delivery.receipts.collect_github", return_value=source) as collect:
                    findings = collect_findings(self.fixture.root, args)
                    self.assertEqual(expected, bool(findings))
                    if expected:
                        self.assertTrue(all("unauthorized" in finding.render() for finding in findings))
                    self.assertTrue(collect.call_args.kwargs["archive_history"])

    def test_check_mode_blocks_seeded_missing_copy(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "tools.lifecycle.verify_archive",
                "--root",
                str(self.fixture.root),
                "--archive-root",
                str(self.fixture.archive_root),
                "--phase",
                "post",
                "--check",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, result.returncode)

if __name__ == "__main__":
    unittest.main()
