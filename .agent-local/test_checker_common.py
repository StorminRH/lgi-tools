#!/usr/bin/env python3
"""Fixture tests for the shared local-checker delivery contract."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest

from checker_common import Finding, find_line, run_checker


class CheckerCommonTests(unittest.TestCase):
    def test_finding_requires_positive_line_and_known_severity(self) -> None:
        with self.assertRaisesRegex(ValueError, "line must be positive"):
            Finding("docs/example.md", 0, "bad line", "error")
        with self.assertRaisesRegex(ValueError, "severity"):
            Finding("docs/example.md", 1, "bad severity", "notice")

    def test_find_line_anchors_first_match_and_defaults_to_one(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.md"
            path.write_text("first\nneedle here\nneedle again\n", encoding="utf-8")
            self.assertEqual(2, find_line(path, "needle"))
            self.assertEqual(1, find_line(path, "missing"))
            self.assertEqual(1, find_line(path.with_name("absent.md"), "needle"))

    def test_cli_exit_matrix_and_json_report(self) -> None:
        def collect(_root: Path) -> list[Finding]:
            return [
                Finding("docs/error.md", 3, "contradiction", "error"),
                Finding("docs/warn.md", 7, "snapshot lag", "warn"),
            ]

        stdout = StringIO()
        with redirect_stdout(stdout):
            self.assertEqual(0, run_checker(collect, []))
        self.assertEqual(
            {
                "errors": ["docs/error.md:3: contradiction"],
                "warnings": ["docs/warn.md:7: snapshot lag"],
            },
            json.loads(stdout.getvalue()),
        )

        with redirect_stdout(StringIO()):
            self.assertEqual(1, run_checker(collect, ["--check"]))

        def warnings_only(_root: Path) -> list[Finding]:
            return [Finding("docs/warn.md", 7, "snapshot lag", "warn")]

        with redirect_stdout(StringIO()):
            self.assertEqual(0, run_checker(warnings_only, ["--check"]))


if __name__ == "__main__":
    unittest.main()
