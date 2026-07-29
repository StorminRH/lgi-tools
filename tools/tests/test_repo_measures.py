#!/usr/bin/env python3
"""Fixture tests for the shared repository measurement rules."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from tools.quality.repo_measures import (
    MeasureError,
    capability_operation_count,
    clone_file_counts,
    diagnostic_suppression_count,
    export_count,
    fallow_zone_entry_count,
    named_file_count,
    pattern_file_count,
    production_file_count,
    production_loc,
    retained_css_family_count,
    sli_count,
    test_contract_suppression_count,
    test_file_count,
    ui_adoption_exemption_count,
    vendor_integration_count,
    zone_file_count,
)


class RepoFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, rel_path: str, text: str) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_bytes(self, rel_path: str, content: bytes) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def write_zones(self, zones: list[dict[str, object]]) -> None:
        self.write(
            ".fallowrc.json",
            json.dumps({"boundaries": {"zones": zones}}),
        )


class RepoMeasureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = RepoFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_source_counts_and_loc_follow_audit_scope(self) -> None:
        self.fixture.write("src/a.ts", "one\ntwo\n")
        self.fixture.write("src/a.test.ts", "test\n")
        self.fixture.write("convex/b.tsx", "one\ntwo\nthree\n")
        self.fixture.write("convex/_generated/api.ts", "generated\n")
        self.fixture.write("scripts/outside.ts", "outside\n")

        self.assertEqual(2, production_file_count(self.fixture.root))
        self.assertEqual(1, test_file_count(self.fixture.root))
        self.assertEqual(5, production_loc(self.fixture.root))

    def test_suppression_partitions_split_markers(self) -> None:
        self.fixture.write(
            "src/a.ts",
            "// eslint-disable-next-line rule\n// fallow-ignore-next-line rule\n",
        )
        self.fixture.write(
            "src/a.test.ts",
            "// @ts-expect-error fixture\n// eslint-disable-next-line rule\n",
        )
        self.fixture.write("convex/_generated/api.ts", "// eslint-disable generated\n")
        self.fixture.write("convex/_generated/api.js", "/* eslint-disable */\n")

        self.assertEqual(5, diagnostic_suppression_count(self.fixture.root))
        self.assertEqual(1, test_contract_suppression_count(self.fixture.root))
        self.assertEqual(
            6,
            diagnostic_suppression_count(self.fixture.root)
            + test_contract_suppression_count(self.fixture.root),
        )

    def test_export_count_requires_a_live_named_file(self) -> None:
        self.fixture.write(
            "src/a.ts",
            "export const one = 1;\n  export const indented = 2;\nexport type Two = 2;\n",
        )
        self.assertEqual(2, export_count(self.fixture.root, "src/a.ts"))
        with self.assertRaisesRegex(MeasureError, "missing file"):
            export_count(self.fixture.root, "src/missing.ts")

    def test_named_and_pattern_counts_deduplicate_inputs(self) -> None:
        self.fixture.write("src/platform/auth/types.ts", "")
        self.fixture.write("src/platform/auth/api-contract.ts", "")

        self.assertEqual(
            1,
            named_file_count(
                self.fixture.root,
                ("src/platform/auth/types.ts", "src/platform/auth/types.ts"),
            ),
        )
        self.assertEqual(
            2,
            pattern_file_count(
                self.fixture.root,
                ("src/platform/auth/*.ts", "src/platform/auth/*contract.ts"),
            ),
        )

    def test_invalid_utf8_is_a_path_specific_measure_error(self) -> None:
        self.fixture.write_bytes("src/invalid.ts", b"export const value = \xff;\n")
        self.fixture.write_bytes("src/invalid.test.ts", b"// @ts-expect-error \xff\n")

        for measure, pattern in (
            (lambda: production_loc(self.fixture.root), r"src/invalid\.ts"),
            (lambda: diagnostic_suppression_count(self.fixture.root), r"src/invalid"),
            (
                lambda: test_contract_suppression_count(self.fixture.root),
                r"src/invalid\.test\.ts",
            ),
            (lambda: export_count(self.fixture.root, "src/invalid.ts"), r"src/invalid\.ts"),
        ):
            with self.subTest(measure=measure):
                with self.assertRaisesRegex(MeasureError, pattern):
                    measure()

    def test_zone_count_honors_first_match_wins(self) -> None:
        self.fixture.write("src/shared/first.ts", "")
        self.fixture.write("src/shared/second.ts", "")
        self.fixture.write_zones(
            [
                {"name": "first", "patterns": ["src/shared/first.ts"]},
                {"name": "target", "patterns": ["src/shared/**"]},
            ]
        )

        self.assertEqual(1, zone_file_count(self.fixture.root, "target"))

    def test_unknown_and_auto_discovered_zones_are_measure_errors(self) -> None:
        self.fixture.write_zones(
            [{"name": "features", "autoDiscover": ["src/features"]}]
        )
        with self.assertRaisesRegex(MeasureError, "uses autoDiscover"):
            zone_file_count(self.fixture.root, "features")
        with self.assertRaisesRegex(MeasureError, "unknown zone"):
            zone_file_count(self.fixture.root, "missing")

    def test_fallow_zone_entry_count_requires_nonempty_zones(self) -> None:
        self.fixture.write_zones([{"name": "one", "patterns": ["src/**"]}])
        self.assertEqual(1, fallow_zone_entry_count(self.fixture.root))
        self.fixture.write_zones([])
        with self.assertRaisesRegex(MeasureError, "nonempty list"):
            fallow_zone_entry_count(self.fixture.root)

    def test_vendor_integration_count_accepts_mixed_keys(self) -> None:
        self.fixture.write(
            "src/composition/vendor-resilience-registry.ts",
            "export const vendorResilienceRegistry = {\n"
            "  'eve-esi': { wrapper: { module: 'a', symbol: 'b' } },\n"
            "  convex: { wrapper: { module: 'c', symbol: 'd' } },\n"
            "  fuzzwork: { wrapper: { module: 'e', symbol: 'f' } },\n"
            "};\n",
        )
        self.assertEqual(3, vendor_integration_count(self.fixture.root))

    def test_vendor_integration_count_errors_when_anchor_missing(self) -> None:
        self.fixture.write("src/composition/vendor-resilience-registry.ts", "export const other = {};\n")
        with self.assertRaisesRegex(MeasureError, "missing anchor"):
            vendor_integration_count(self.fixture.root)

    def test_capability_and_sli_counts(self) -> None:
        self.fixture.write(
            "src/data/telemetry/capability.ts",
            "export const CAPABILITIES = {\n"
            "  'account.switch': { operation: 'mutation' },\n"
            "  'prices.read': { operation: 'read' },\n"
            "};\n",
        )
        self.fixture.write(
            "src/data/telemetry/sli.ts",
            "export const SLI_IDS = [\n  'read_success_rate',\n  'esi_success_rate',\n];\n",
        )
        self.assertEqual(2, capability_operation_count(self.fixture.root))
        self.assertEqual(2, sli_count(self.fixture.root))

    def test_ui_adoption_and_retained_css_counts(self) -> None:
        self.fixture.write(
            "src/composition/ui-adoption-registry.ts",
            "export const uiAdoptionRegistry = {\n"
            "  rawButtons: [\n"
            "    // don't count 'commented.tsx'\n"
            "    { reason: 'x', file: 'a.tsx' },\n"
            "    /* or 'blocked.tsx' */ 'aa.tsx',\n"
            "  ],\n"
            "  rawDetails: [{ file: 'b.tsx', reason: 'y' }, { file: 'c.tsx', reason: 'z' }],\n"
            "  hiddenInputs: ['d.tsx', 'e.tsx'],\n"
            "  nativeTitles: [{ file: 'f.tsx', reason: 'g' }],\n"
            "  disabledControlTitles: ['h.tsx'],\n"
            "  temporaryCssFamilies: [],\n"
            "  retainedCssFamilies: ['one', 'two', 'three'],\n"
            "} as const;\n",
        )
        self.assertEqual(8, ui_adoption_exemption_count(self.fixture.root))
        self.assertEqual(3, retained_css_family_count(self.fixture.root))

    def test_ui_adoption_missing_family_is_a_measure_error(self) -> None:
        self.fixture.write(
            "src/composition/ui-adoption-registry.ts",
            "export const uiAdoptionRegistry = {\n  rawButtons: [],\n} as const;\n",
        )
        with self.assertRaisesRegex(MeasureError, "missing rawDetails"):
            ui_adoption_exemption_count(self.fixture.root)

    def test_clone_counts_use_distinct_instance_files(self) -> None:
        payload = {
            "clone_groups": [
                {
                    "fingerprint": "dup:one",
                    "instances": [
                        {"file": "src/a.ts"},
                        {"file": "src/a.ts"},
                        {"file": "src/b.ts"},
                    ],
                }
            ]
        }
        self.assertEqual(
            {"dup:one": 2},
            clone_file_counts(self.fixture.root, lambda _root: payload),
        )

    def test_invalid_clone_output_is_a_measure_error(self) -> None:
        with self.assertRaisesRegex(MeasureError, "clone_groups"):
            clone_file_counts(self.fixture.root, lambda _root: {})


if __name__ == "__main__":
    unittest.main()
