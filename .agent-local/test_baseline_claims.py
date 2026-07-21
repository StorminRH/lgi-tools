#!/usr/bin/env python3
"""Fixture tests for the strict code-health baseline checker."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from check_agent_drift import LIFECYCLE_CHECKERS
from check_baseline_claims import (
    BASELINE_TEMPLATE_RELPATH,
    BaselineAnchor,
    BaselineSchema,
    _derived_delta,
    collect_findings,
    frozen_version_start,
    parse_baseline_schema,
)
from repo_measures import (
    production_file_count,
    production_loc,
    suppression_count,
    test_file_count,
)


REAL_ROOT = Path(__file__).resolve().parent.parent
CANONICAL_METRICS = (
    "Production TS/TSX files",
    "Production TS/TSX LOC",
    "Test files",
    "Coverage — statements",
    "Coverage — branches",
    "Coverage — functions",
    "Coverage — lines",
    "Fallow health score",
    "Functions above health thresholds",
    "Auth query-hub exports",
    "`PricingContextValue` fields",
    "`usePricing()` call sites",
    "Planner concern-context fields",
    "Concern-hook consumers",
    "Telemetry query breadth",
    "ESI refresh-job query exports",
    "`auth-surface` files",
    "ESI dataset registry entries",
    "Freshness leaf breadth",
    "Cron shell declarations",
    "Real-Postgres harness consumers",
    "Dataset declaration census",
    "API contract completeness",
    "EVE type-image resolver breadth",
    "Threshold overrides",
    "Source suppressions",
    "Whole-version Fallow clone groups",
    "Accepted duplication baseline clone groups",
    "Version-start-pinned Fallow verdict",
    "`src/data/telemetry/queries.ts`",
    "`src/data/esi-refresh-jobs/queries.ts`",
)
CANONICAL_SCHEMA = BaselineSchema(
    sections=("Snapshot", "Metrics", "Watch findings"),
    identity_columns=("Field", "Value"),
    identity_keys=("Date", "App version", "Code ref", "Measurement scope"),
    metric_columns=("Metric", "Version-start", "Current", "Delta"),
    metric_keys=CANONICAL_METRICS,
)


class BaselineFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.write("src/queries.ts", "export const one = 1;\n")
        self.write("src/queries.test.ts", "test();\n")
        self.write("src/auth/a.ts", "")
        self.write("src/data/telemetry/queries.ts", "export const telemetry = 1;\n")
        self.write(
            "src/data/esi-refresh-jobs/queries.ts",
            "export const refreshJobs = 1;\n",
        )
        self.write_zones(["src/auth/a.ts"])
        self.write(
            BASELINE_TEMPLATE_RELPATH,
            (REAL_ROOT / BASELINE_TEMPLATE_RELPATH).read_text(encoding="utf-8"),
        )

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
                        "zones": [{"name": "auth-surface", "patterns": patterns}]
                    }
                }
            ),
        )

    def default_values(self) -> dict[str, str]:
        values = {key: "0" for key in CANONICAL_METRICS}
        values.update(
            {
                "Production TS/TSX files": str(production_file_count(self.root)),
                "Production TS/TSX LOC": f"{production_loc(self.root):,}",
                "Test files": str(test_file_count(self.root)),
                "Source suppressions": str(suppression_count(self.root)),
                "Whole-version Fallow clone groups": "1",
                "`auth-surface` files": "1",
                "`src/data/telemetry/queries.ts`": "1 exports",
                "`src/data/esi-refresh-jobs/queries.ts`": "1 exports",
            }
        )
        return values

    def baseline(
        self,
        *,
        current: dict[str, str] | None = None,
        version_start: dict[str, str] | None = None,
        omit_key: str | None = None,
        rename_key: tuple[str, str] | None = None,
        extra_metric_rows: str = "",
        free_prose: str = "",
        extra_section: str = "",
        wrong_delta_key: str | None = None,
    ) -> str:
        current_values = self.default_values()
        current_values.update(current or {})
        start_values = dict(current_values)
        start_values.update(version_start or {})
        rows: list[str] = []
        for original_key in CANONICAL_METRICS:
            if original_key == omit_key:
                continue
            key = rename_key[1] if rename_key and rename_key[0] == original_key else original_key
            start = start_values[original_key]
            live = current_values[original_key]
            delta = "99" if original_key == wrong_delta_key else _derived_delta(start, live)
            rows.append(f"| {key} | {start} | {live} | {delta} |")
        metric_text = "\n".join(rows)
        text = (
            "# Code Health Baseline (LGI.tools)\n\n"
            "## Snapshot\n\n"
            "| Field | Value |\n"
            "| --- | --- |\n"
            "| Date | 2026-07-20 |\n"
            "| App version | 3.10.0.2 |\n"
            "| Code ref | `0123456789abcdef0123456789abcdef01234567` |\n"
            "| Measurement scope | Fixture |\n\n"
            "## Metrics\n\n"
            "| Metric | Version-start | Current | Delta |\n"
            "| --- | ---: | ---: | ---: |\n"
            f"{metric_text}\n"
            f"{extra_metric_rows}"
            f"{free_prose}"
            "\n## Watch findings\n"
            f"{extra_section}"
        )
        self.write("docs/CODE_HEALTH_BASELINE.md", text)
        return text

    def findings(self, anchor: BaselineAnchor | None = None):
        selected_anchor = anchor or BaselineAnchor("bootstrap")
        with (
            patch("check_baseline_claims.clone_file_counts", return_value={"dup:one": 2}),
            patch("check_baseline_claims.frozen_version_start", return_value=selected_anchor),
        ):
            return collect_findings(self.root)

    def messages(self, anchor: BaselineAnchor | None = None) -> list[str]:
        return [finding.render() for finding in self.findings(anchor)]


class BaselineClaimTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = BaselineFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_canonical_schema_integrity_is_locked(self) -> None:
        self.assertEqual(CANONICAL_SCHEMA, parse_baseline_schema(REAL_ROOT))

    def test_clean_strict_fixture_has_no_findings(self) -> None:
        self.fixture.baseline()
        self.assertEqual([], self.fixture.messages())

    def test_extra_section_is_an_error(self) -> None:
        self.fixture.baseline(extra_section="\n## Notes\n")
        self.assertTrue(
            any("section is not allowed" in finding.message for finding in self.fixture.findings())
        )

    def test_free_prose_is_an_error(self) -> None:
        self.fixture.baseline(free_prose="A narrative note.\n")
        self.assertTrue(
            any("free prose" in finding.message for finding in self.fixture.findings())
        )

    def test_off_registry_metric_is_an_error(self) -> None:
        self.fixture.baseline(extra_metric_rows="| Notes | 0 | 0 | 0 |\n")
        self.assertTrue(
            any("metric key is not registered: Notes" in finding.message for finding in self.fixture.findings())
        )

    def test_table_row_outside_schema_tables_is_an_error(self) -> None:
        self.fixture.baseline(extra_section="\n| Notes | Value |\n")
        self.assertTrue(
            any("outside a schema table section" in finding.message for finding in self.fixture.findings())
        )

    def test_wrong_delta_is_an_error(self) -> None:
        self.fixture.baseline(wrong_delta_key="Production TS/TSX files")
        self.assertTrue(
            any("metric delta" in finding.message for finding in self.fixture.findings())
        )

    def test_missing_required_metric_is_an_error(self) -> None:
        self.fixture.baseline(omit_key="Source suppressions")
        self.assertTrue(
            any("missing required metric: Source suppressions" in finding.message for finding in self.fixture.findings())
        )

    def test_missing_template_blocks_enforcement(self) -> None:
        self.fixture.baseline()
        (self.fixture.root / BASELINE_TEMPLATE_RELPATH).unlink()
        findings = self.fixture.findings()
        self.assertEqual(1, len(findings))
        self.assertEqual("error", findings[0].severity)
        self.assertIn("schema is missing or unusable", findings[0].message)

    def test_deleted_file_claim_is_an_error(self) -> None:
        self.fixture.baseline()
        (self.fixture.root / "src/data/telemetry/queries.ts").unlink()
        self.assertTrue(
            any("baseline table references missing file" in message for message in self.fixture.messages())
        )

    def test_stale_counts_show_asserted_and_measured_values(self) -> None:
        self.fixture.baseline(
            current={
                "Production TS/TSX files": "9",
                "`src/data/telemetry/queries.ts`": "3 exports",
                "`auth-surface` files": "1",
            }
        )
        self.fixture.write("src/auth/b.ts", "")
        self.fixture.write_zones(["src/auth/a.ts", "src/auth/b.ts"])
        messages = self.fixture.messages()
        self.assertTrue(any("Production TS/TSX files asserted 9" in message for message in messages))
        self.assertTrue(any("exports asserted 3, measured 1" in message for message in messages))
        self.assertTrue(any("auth-surface files asserted 1, measured 2" in message for message in messages))

    def test_export_claim_reads_current_not_version_start(self) -> None:
        self.fixture.baseline(
            version_start={"`src/data/telemetry/queries.ts`": "99 exports"},
            current={"`src/data/telemetry/queries.ts`": "1 exports"},
        )
        self.assertFalse(
            any("telemetry/queries.ts exports asserted" in message for message in self.fixture.messages())
        )

    def test_absent_auth_surface_metric_is_a_warning(self) -> None:
        self.fixture.baseline(omit_key="`auth-surface` files")
        self.assertTrue(
            any(
                finding.severity == "warn" and "no parseable auth-surface" in finding.message
                for finding in self.fixture.findings()
            )
        )

    def test_auth_surface_finding_uses_the_metric_line(self) -> None:
        self.fixture.baseline()
        self.fixture.write("src/auth/b.ts", "")
        self.fixture.write_zones(["src/auth/a.ts", "src/auth/b.ts"])
        baseline_lines = (
            self.fixture.root / "docs/CODE_HEALTH_BASELINE.md"
        ).read_text(encoding="utf-8").splitlines()
        expected_line = next(
            index
            for index, line in enumerate(baseline_lines, start=1)
            if line.startswith("| `auth-surface` files |")
        )
        finding = next(
            finding
            for finding in self.fixture.findings()
            if "auth-surface files asserted" in finding.message
        )
        self.assertEqual(expected_line, finding.line)

    def _strict_anchor(self, main_text: str) -> BaselineAnchor:
        return frozen_version_start(self.fixture.root, read=lambda _root: main_text)

    def test_identical_version_start_is_clean(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.assertEqual("enforced", anchor.state)
        self.assertEqual([], self.fixture.messages(anchor))

    def test_changed_version_start_is_an_error(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start={"Production TS/TSX files": "999"})
        self.assertTrue(any("version-start value changed" in message for message in self.fixture.messages(anchor)))

    def test_renamed_version_start_key_is_an_error(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(rename_key=("Source suppressions", "Renamed suppressions"))
        self.assertTrue(any("version-start metric keys differ" in message for message in self.fixture.messages(anchor)))

    def test_deleted_version_start_key_is_an_error(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(omit_key="Source suppressions")
        self.assertTrue(any("version-start metric keys differ" in message for message in self.fixture.messages(anchor)))

    def test_old_format_anchor_permits_bootstrap(self) -> None:
        anchor = frozen_version_start(
            self.fixture.root,
            read=lambda _root: "| Metric | Current | Previous | Delta / note |\n",
        )
        self.assertEqual("bootstrap", anchor.state)
        self.fixture.baseline()
        self.assertEqual([], self.fixture.messages(anchor))

    def test_unavailable_anchor_is_blocking(self) -> None:
        anchor = frozen_version_start(self.fixture.root, read=lambda _root: None)
        self.assertEqual("unavailable", anchor.state)
        self.fixture.baseline()
        findings = self.fixture.findings(anchor)
        self.assertEqual(1, len(findings))
        self.assertEqual("error", findings[0].severity)
        self.assertIn("anchor from origin/main is unavailable", findings[0].message)

    def test_checker_is_registered_as_a_lifecycle_gate(self) -> None:
        self.assertIn(".agent-local/check_baseline_claims.py", LIFECYCLE_CHECKERS)


if __name__ == "__main__":
    unittest.main()
