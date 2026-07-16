#!/usr/bin/env python3
"""Fixture tests for the mechanically derivable baseline claims checker."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from check_baseline_claims import collect_findings


class BaselineFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.write("src/queries.ts", "export const one = 1;\n")
        self.write("src/queries.test.ts", "test();\n")
        self.write_zones(["src/auth/a.ts"])
        self.write("src/auth/a.ts", "")

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, rel_path: str, text: str) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_zones(self, patterns: list[str]) -> None:
        self.write(
            ".fallowrc.json",
            json.dumps(
                {
                    "boundaries": {
                        "zones": [
                            {"name": "auth-surface", "patterns": patterns}
                        ]
                    }
                }
            ),
        )

    def baseline(
        self,
        *,
        production_files: str = "2",
        production_loc: str = "1",
        test_files: str = "1",
        suppressions: str = "0",
        clones: str = "1",
        extra_rows: str = "",
        rails: str = "- **Boundaries:** auth-surface remains exactly one files.\n",
        omit_label: str | None = None,
    ) -> None:
        rows = [
            ("Production TS/TSX files", production_files),
            ("Production TS/TSX LOC", production_loc),
            ("Test files", test_files),
            ("Source suppressions", suppressions),
            ("Whole-version Fallow clone groups", clones),
        ]
        table = "\n".join(
            f"| {label} | {value} | note |"
            for label, value in rows
            if label != omit_label
        )
        self.write(
            "docs/CODE_HEALTH_BASELINE.md",
            "# Baseline\n\n"
            "## Step 1 metrics\n\n"
            "| Metric | Current | Note |\n"
            "| --- | ---: | --- |\n"
            f"{table}\n"
            f"{extra_rows}"
            "\n## Rails and exceptions\n\n"
            f"{rails}"
            "\n## Campaign queue\n",
        )

    def findings(self):
        with patch("check_baseline_claims.clone_file_counts", return_value={"dup:one": 2}):
            return collect_findings(self.root)

    def messages(self) -> list[str]:
        return [finding.render() for finding in self.findings()]


class BaselineClaimTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = BaselineFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_matching_claims_are_clean(self) -> None:
        self.fixture.baseline(
            extra_rows="| `src/queries.ts` | 1 exports | healthy |\n"
        )
        self.assertEqual([], self.fixture.messages())

    def test_deleted_file_claim_is_an_error(self) -> None:
        self.fixture.baseline(
            extra_rows="| `src/missing.ts` | Watch | 2 exports |\n"
        )
        self.assertIn(
            "baseline table references missing file: src/missing.ts",
            self.fixture.messages()[0],
        )
        self.assertEqual("error", self.fixture.findings()[0].severity)

    def test_stale_counts_show_asserted_and_measured_values(self) -> None:
        self.fixture.write("src/auth/b.ts", "")
        self.fixture.write_zones(["src/auth/a.ts", "src/auth/b.ts"])
        self.fixture.baseline(
            production_files="9",
            extra_rows="| `src/queries.ts` | 3 exports | healthy |\n",
        )
        messages = self.fixture.messages()
        self.assertTrue(
            any("Production TS/TSX files asserted 9, measured 3" in message for message in messages)
        )
        self.assertTrue(
            any("src/queries.ts exports asserted 3, measured 1" in message for message in messages)
        )
        self.assertTrue(
            any("auth-surface files asserted 1, measured 2" in message for message in messages)
        )

    def test_missing_required_step_one_row_is_an_error(self) -> None:
        self.fixture.baseline(omit_label="Source suppressions")
        findings = self.fixture.findings()
        self.assertTrue(
            any(
                finding.severity == "error"
                and "missing required Step 1 row: Source suppressions" in finding.message
                for finding in findings
            )
        )

    def test_carried_export_row_skips_value_diff_but_checks_existence(self) -> None:
        self.fixture.baseline(
            extra_rows="| `src/queries.ts` | 99 exports | Carried from prior run |\n"
        )
        self.assertEqual([], self.fixture.messages())

    def test_absent_auth_surface_phrase_is_a_warning(self) -> None:
        self.fixture.baseline(rails="- **Boundaries:** unchanged.\n")
        findings = self.fixture.findings()
        self.assertTrue(
            any(
                finding.severity == "warn"
                and "no parseable auth-surface exact-file claim" in finding.message
                for finding in findings
            )
        )


if __name__ == "__main__":
    unittest.main()
