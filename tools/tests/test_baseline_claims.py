#!/usr/bin/env python3
"""Fixture tests for the strict code-health baseline checker."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.policy.check_agent_policy import LIFECYCLE_CHECKERS
from tools.quality.check_baseline_claims import (
    AUTH_CONTRACT_METRIC,
    AUTH_CONTRACT_PATHS,
    BASELINE_TEMPLATE_RELPATH,
    LEGACY_AUTH_SURFACE_METRIC,
    BaselineAnchor,
    BaselineSchema,
    _derived_delta,
    collect_findings,
    frozen_version_start,
    parse_baseline_schema,
)
from tools.quality.repo_measures import (
    diagnostic_suppression_count,
    production_file_count,
    production_loc,
    test_contract_suppression_count,
    test_file_count,
)
from tools._lib.repository import ROOT


REAL_ROOT = ROOT
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
    "Planner concern-context fields",
    "Concern-hook consumers",
    AUTH_CONTRACT_METRIC,
    "ESI dataset registry entries",
    "Freshness leaf breadth",
    "Cron shell declarations",
    "Real-Postgres harness consumers",
    "Dataset declaration census",
    "API contract completeness",
    "EVE type-image resolver breadth",
    "Threshold overrides",
    "Diagnostic suppressions",
    "Test contract suppressions",
    "Whole-version Fallow clone groups",
    "Accepted duplication baseline clone groups",
    "Version-start-pinned Fallow verdict",
    "Fallow boundary zones (configured)",
    "Vendor-resilience integrations",
    "Instrumented capability operations",
    "Owned service-level indicators",
    "UI adoption exemptions",
    "Retained legacy CSS families",
    "`src/data/telemetry/queries.ts`",
    "`src/data/esi-refresh-jobs/queries.ts`",
)
CANONICAL_SCHEMA = BaselineSchema(
    sections=("Snapshot", "Metrics", "Watch findings"),
    identity_columns=("Field", "Value"),
    identity_keys=("Date", "App version", "Code ref", "Measurement scope", "Version-start ref"),
    metric_columns=("Metric", "Version-start", "Current", "Delta"),
    metric_keys=CANONICAL_METRICS,
)


class BaselineFixture:
    CODE_REF = "0123456789abcdef0123456789abcdef01234567"
    PRIOR_VERSION_REF = "abcdef0123456789abcdef0123456789abcdef01"

    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.write("src/queries.ts", "export const one = 1;\n")
        self.write("src/queries.test.ts", "test();\n")
        for rel_path in AUTH_CONTRACT_PATHS:
            self.write(rel_path, "")
        self.write("src/data/telemetry/queries.ts", "export const telemetry = 1;\n")
        self.write(
            "src/data/esi-refresh-jobs/queries.ts",
            "export const refreshJobs = 1;\n",
        )
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

    def default_values(self) -> dict[str, str]:
        values = {key: "0" for key in CANONICAL_METRICS}
        values.update(
            {
                "Production TS/TSX files": str(production_file_count(self.root)),
                "Production TS/TSX LOC": f"{production_loc(self.root):,}",
                "Test files": str(test_file_count(self.root)),
                "Diagnostic suppressions": str(diagnostic_suppression_count(self.root)),
                "Test contract suppressions": str(test_contract_suppression_count(self.root)),
                "Whole-version Fallow clone groups": "1",
                "Fallow boundary zones (configured)": "1",
                "Vendor-resilience integrations": "1",
                "Instrumented capability operations": "1",
                "Owned service-level indicators": "1",
                "UI adoption exemptions": "1",
                "Retained legacy CSS families": "1",
                AUTH_CONTRACT_METRIC: "3",
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
        code_ref: str = CODE_REF,
        version_start_ref: str | None = CODE_REF,
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
        version_ref_row = (
            f"| Version-start ref | {version_start_ref} |\n"
            if version_start_ref is not None
            else ""
        )
        text = (
            "# Code Health Baseline (LGI.tools)\n\n"
            "## Snapshot\n\n"
            "| Field | Value |\n"
            "| --- | --- |\n"
            "| Date | 2026-07-20 |\n"
            "| App version | 3.10.0.2 |\n"
            f"| Code ref | `{code_ref}` |\n"
            "| Measurement scope | Fixture |\n"
            f"{version_ref_row}"
            "\n## Metrics\n\n"
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
            patch("tools.quality.check_baseline_claims.clone_file_counts", return_value={"dup:one": 2}),
            patch("tools.quality.check_baseline_claims.fallow_zone_entry_count", return_value=1),
            patch("tools.quality.check_baseline_claims.vendor_integration_count", return_value=1),
            patch("tools.quality.check_baseline_claims.capability_operation_count", return_value=1),
            patch("tools.quality.check_baseline_claims.sli_count", return_value=1),
            patch("tools.quality.check_baseline_claims.ui_adoption_exemption_count", return_value=1),
            patch("tools.quality.check_baseline_claims.retained_css_family_count", return_value=1),
            patch("tools.quality.check_baseline_claims.frozen_version_start", return_value=selected_anchor),
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
        self.fixture.baseline(omit_key="Diagnostic suppressions")
        self.assertTrue(
            any("missing required metric: Diagnostic suppressions" in finding.message for finding in self.fixture.findings())
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
                AUTH_CONTRACT_METRIC: "2",
            }
        )
        messages = self.fixture.messages()
        self.assertTrue(any("Production TS/TSX files asserted 9" in message for message in messages))
        self.assertTrue(any("exports asserted 3, measured 1" in message for message in messages))
        self.assertTrue(any("auth contract paths asserted 2, measured 3" in message for message in messages))

    def test_export_claim_reads_current_not_version_start(self) -> None:
        self.fixture.baseline(
            version_start={"`src/data/telemetry/queries.ts`": "99 exports"},
            current={"`src/data/telemetry/queries.ts`": "1 exports"},
        )
        self.assertFalse(
            any("telemetry/queries.ts exports asserted" in message for message in self.fixture.messages())
        )

    def test_absent_auth_contract_metric_is_a_warning(self) -> None:
        self.fixture.baseline(omit_key=AUTH_CONTRACT_METRIC)
        self.assertTrue(
            any(
                finding.severity == "warn" and "no parseable auth contract" in finding.message
                for finding in self.fixture.findings()
            )
        )

    def test_auth_contract_finding_uses_the_metric_line(self) -> None:
        self.fixture.baseline(current={AUTH_CONTRACT_METRIC: "2"})
        baseline_lines = (
            self.fixture.root / "docs/CODE_HEALTH_BASELINE.md"
        ).read_text(encoding="utf-8").splitlines()
        expected_line = next(
            index
            for index, line in enumerate(baseline_lines, start=1)
            if line.startswith(f"| {AUTH_CONTRACT_METRIC} |")
        )
        finding = next(
            finding
            for finding in self.fixture.findings()
            if "auth contract paths asserted" in finding.message
        )
        self.assertEqual(expected_line, finding.line)

    def _strict_anchor(self, main_text: str) -> BaselineAnchor:
        return frozen_version_start(self.fixture.root, read=lambda _root: main_text)

    def test_identical_version_start_is_clean(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.assertEqual("enforced", anchor.state)
        self.assertEqual([], self.fixture.messages(anchor))

    def test_legacy_auth_metric_anchor_preserves_the_frozen_value(self) -> None:
        current_text = self.fixture.baseline()
        legacy_text = current_text.replace(AUTH_CONTRACT_METRIC, LEGACY_AUTH_SURFACE_METRIC)
        anchor = self._strict_anchor(legacy_text)
        self.assertIn((AUTH_CONTRACT_METRIC, "3"), anchor.values)
        self.assertEqual([], self.fixture.messages(anchor))

    def test_changed_version_start_is_an_error(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start={"Production TS/TSX files": "999"})
        self.assertTrue(any("version-start value changed" in message for message in self.fixture.messages(anchor)))

    def test_renamed_version_start_key_is_an_error(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(rename_key=("Diagnostic suppressions", "Renamed suppressions"))
        self.assertTrue(any("version-start metric keys differ" in message for message in self.fixture.messages(anchor)))

    def test_deleted_version_start_key_is_an_error(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(omit_key="Diagnostic suppressions")
        self.assertTrue(any("version-start metric keys differ" in message for message in self.fixture.messages(anchor)))

    def test_transition_promotes_origin_main_current_values(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=self.fixture.PRIOR_VERSION_REF)
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start_ref=self.fixture.CODE_REF)
        self.assertEqual([], self.fixture.messages(anchor))

    def test_first_adoption_transition_without_main_ref_is_clean(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=None)
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start_ref=self.fixture.CODE_REF)
        self.assertEqual([], self.fixture.messages(anchor))

    def test_transition_permits_metric_key_additions_and_removals(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=self.fixture.PRIOR_VERSION_REF)
        main_text = "\n".join(
            line
            for line in main_text.splitlines()
            if not line.startswith("| Diagnostic suppressions |")
        )
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start_ref=self.fixture.CODE_REF)
        self.assertFalse(
            any("version-start metric keys differ" in message for message in self.fixture.messages(anchor))
        )

        main_text = self.fixture.baseline(version_start_ref=self.fixture.PRIOR_VERSION_REF)
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(
            omit_key="Diagnostic suppressions",
            version_start_ref=self.fixture.CODE_REF,
        )
        self.assertFalse(
            any("version-start metric keys differ" in message for message in self.fixture.messages(anchor))
        )

    def test_transition_rejects_value_not_equal_to_origin_main_current(self) -> None:
        main_text = self.fixture.baseline(
            current={"Production TS/TSX files": "9"},
            version_start_ref=self.fixture.PRIOR_VERSION_REF,
        )
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start_ref=self.fixture.CODE_REF)
        self.assertTrue(
            any(
                "transition Version-start for Production TS/TSX files must equal "
                "origin/main Current '9'" in message
                for message in self.fixture.messages(anchor)
            )
        )

    def test_transition_rejects_new_metric_start_not_equal_to_current(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=self.fixture.PRIOR_VERSION_REF)
        main_text = "\n".join(
            line
            for line in main_text.splitlines()
            if not line.startswith("| Diagnostic suppressions |")
        )
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(
            version_start={"Diagnostic suppressions": "99"},
            version_start_ref=self.fixture.CODE_REF,
        )
        self.assertTrue(
            any(
                "transition Version-start for new metric Diagnostic suppressions "
                "must equal working Current" in message
                for message in self.fixture.messages(anchor)
            )
        )

    def test_transition_ref_must_equal_origin_main_code_ref(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=self.fixture.PRIOR_VERSION_REF)
        anchor = self._strict_anchor(main_text)
        wrong_ref = "1111111111111111111111111111111111111111"
        self.fixture.baseline(version_start_ref=wrong_ref)
        self.assertTrue(
            any("transition Version-start ref must equal origin/main Code ref" in message for message in self.fixture.messages(anchor))
        )

    def test_working_ref_cannot_disappear_after_adoption(self) -> None:
        main_text = self.fixture.baseline()
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start_ref=None)
        self.assertTrue(
            any("working baseline is missing Version-start ref" in message for message in self.fixture.messages(anchor))
        )

    def test_working_ref_must_be_a_full_lowercase_sha(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=None)
        anchor = self._strict_anchor(main_text)
        self.fixture.baseline(version_start_ref="not-a-sha")
        self.assertTrue(
            any("must be a full lowercase SHA" in message for message in self.fixture.messages(anchor))
        )

    def test_origin_main_code_ref_accepts_a_leading_unwrapped_sha(self) -> None:
        main_text = self.fixture.baseline(version_start_ref=self.fixture.PRIOR_VERSION_REF)
        main_text = main_text.replace(
            f"| Code ref | `{self.fixture.CODE_REF}` |",
            f"| Code ref | {self.fixture.CODE_REF} on main |",
        )
        anchor = self._strict_anchor(main_text)
        self.assertEqual(self.fixture.CODE_REF, anchor.code_ref)

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
        self.assertIn("tools/quality/check_baseline_claims.py", LIFECYCLE_CHECKERS)


if __name__ == "__main__":
    unittest.main()
