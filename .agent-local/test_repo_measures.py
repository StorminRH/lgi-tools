#!/usr/bin/env python3
"""Fixture tests for the shared repository measurement rules."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from repo_measures import (
    MeasureError,
    clone_file_counts,
    export_count,
    named_file_count,
    pattern_file_count,
    production_file_count,
    production_loc,
    suppression_count,
    test_file_count,
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

    def test_suppressions_include_tests_and_generated_source(self) -> None:
        self.fixture.write(
            "src/a.ts",
            "// eslint-disable-next-line rule\n// fallow-ignore-next-line rule\n",
        )
        self.fixture.write("src/a.test.ts", "// @ts-expect-error fixture\n")
        self.fixture.write("convex/_generated/api.ts", "// eslint-disable generated\n")
        self.fixture.write("convex/_generated/api.js", "/* eslint-disable */\n")

        self.assertEqual(5, suppression_count(self.fixture.root))

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

        for measure in (
            lambda: production_loc(self.fixture.root),
            lambda: suppression_count(self.fixture.root),
            lambda: export_count(self.fixture.root, "src/invalid.ts"),
        ):
            with self.subTest(measure=measure):
                with self.assertRaisesRegex(
                    MeasureError,
                    r"file is not valid UTF-8: src/invalid\.ts",
                ):
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
