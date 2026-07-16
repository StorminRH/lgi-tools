#!/usr/bin/env python3
"""Fixture tests for the Watch-trigger evaluator."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from check_watch_triggers import collect_findings


SCRIPT = Path(__file__).with_name("check_watch_triggers.py")


class WatchFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, rel_path: str, text: str) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def baseline(self, lines: str) -> None:
        self.write(
            "docs/CODE_HEALTH_BASELINE.md",
            "# Baseline\n\n```watch-trigger\n" + lines + "```\n",
        )

    def messages(self) -> list[str]:
        return [finding.render() for finding in collect_findings(self.root)]


class WatchTriggerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = WatchFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_tripped_export_trigger_promotes_with_measured_value(self) -> None:
        self.fixture.write("src/queries.ts", "export const a = 1;\nexport const b = 2;\n")
        self.fixture.baseline("AF-006: exports(src/queries.ts) >= 2\n")

        self.assertEqual(
            [
                "docs/CODE_HEALTH_BASELINE.md:4: promote AF-006 — "
                "exports(src/queries.ts) = 2 (trigger: >= 2)"
            ],
            self.fixture.messages(),
        )

    def test_untripped_trigger_is_clean(self) -> None:
        self.fixture.write("src/queries.ts", "export const a = 1;\n")
        self.fixture.baseline("AF-006: exports(src/queries.ts) >= 2\n")
        self.assertEqual([], self.fixture.messages())

    def test_malformed_trigger_is_an_error(self) -> None:
        self.fixture.baseline("AF-007: loc(src/queries.ts) > 15\n")
        self.assertEqual(
            [
                "docs/CODE_HEALTH_BASELINE.md:4: unparseable watch-trigger line: "
                "'AF-007: loc(src/queries.ts) > 15'"
            ],
            self.fixture.messages(),
        )

    def test_unknown_zone_is_an_error(self) -> None:
        self.fixture.write(
            ".fallowrc.json",
            json.dumps({"boundaries": {"zones": []}}),
        )
        self.fixture.baseline("AF-008: files(zone:auth-surface) >= 4\n")
        self.assertEqual(
            [
                "docs/CODE_HEALTH_BASELINE.md:4: cannot measure "
                "files(zone:auth-surface): unknown zone: auth-surface"
            ],
            self.fixture.messages(),
        )

    def test_multiline_block_promotes_an_id_once_when_any_line_trips(self) -> None:
        self.fixture.write("src/queries.ts", "export const a = 1;\n")
        self.fixture.baseline(
            "AF-006: exports(src/queries.ts) > 5\n"
            "AF-006: exports(src/queries.ts) == 1\n"
            "AF-006: exports(src/queries.ts) >= 1\n"
        )
        messages = self.fixture.messages()
        self.assertEqual(1, len(messages))
        self.assertIn("promote AF-006", messages[0])

    def test_absent_clone_group_measures_zero(self) -> None:
        self.fixture.baseline("AF-009: clones(dup:gone) == 0\n")
        with patch("check_watch_triggers.clone_file_counts", return_value={}):
            self.assertEqual(
                [
                    "docs/CODE_HEALTH_BASELINE.md:4: promote AF-009 — "
                    "clones(dup:gone) = 0 (trigger: == 0)"
                ],
                self.fixture.messages(),
            )

    def test_check_exit_code_blocks_errors_but_not_promotions(self) -> None:
        self.fixture.write("src/queries.ts", "export const a = 1;\n")
        self.fixture.baseline("AF-006: exports(src/queries.ts) >= 1\n")
        promoted = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.fixture.root), "--check"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, promoted.returncode)

        self.fixture.baseline("AF-006: loc(src/queries.ts) >= 1\n")
        malformed = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.fixture.root), "--check"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, malformed.returncode)


if __name__ == "__main__":
    unittest.main()
