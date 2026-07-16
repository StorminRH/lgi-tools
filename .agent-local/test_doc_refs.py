#!/usr/bin/env python3
"""Fixture tests for the repository document-reference checker."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from check_doc_refs import collect_findings


class DocRefsFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "docs").mkdir()
        (self.root / "src/live").mkdir(parents=True)
        (self.root / "src/live/file.ts").write_text("export {};\n", encoding="utf-8")

    def close(self) -> None:
        self.temporary.cleanup()

    def write(self, name: str, text: str) -> None:
        path = self.root / "docs" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


class DocRefsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = DocRefsFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def rendered(self) -> list[tuple[str, str]]:
        return [
            (finding.severity, finding.render())
            for finding in collect_findings(self.fixture.root)
        ]

    def test_dead_path_reports_source_file_and_line(self) -> None:
        self.fixture.write("guide.md", "first\nSee `src/dead/file.ts`.\n")
        self.assertEqual(
            [
                (
                    "error",
                    "docs/guide.md:2: repository path does not resolve: src/dead/file.ts",
                )
            ],
            self.rendered(),
        )

    def test_line_suffix_and_matching_glob_resolve(self) -> None:
        self.fixture.write(
            "guide.md",
            "See `src/live/file.ts:10-12` and `src/live/*.ts`.\n",
        )
        self.assertEqual([], self.rendered())

    def test_unmatched_glob_is_an_error(self) -> None:
        self.fixture.write("guide.md", "See `src/missing/*.ts`.\n")
        self.assertEqual(
            [
                (
                    "error",
                    "docs/guide.md:1: repository path does not resolve: src/missing/*.ts",
                )
            ],
            self.rendered(),
        )

    def test_missing_archive_reference_warns(self) -> None:
        self.fixture.write(
            "guide.md",
            "See `../LGI Tools Document Archive/versions/9.9/PLAN.md`.\n",
        )
        self.assertEqual(
            [
                (
                    "warn",
                    "docs/guide.md:1: archive reference does not resolve: "
                    "../LGI Tools Document Archive/versions/9.9/PLAN.md",
                )
            ],
            self.rendered(),
        )

    def test_commands_ids_and_basename_only_spans_are_not_path_claims(self) -> None:
        self.fixture.write(
            "guide.md",
            "Run `python3 scripts/missing.py --check`; inspect `dup:abc`, "
            "`zone:auth`, `sha256:abc`, and `membership.ts`.\n",
        )
        self.assertEqual([], self.rendered())

    def test_schema_templates_are_not_concrete_path_claims(self) -> None:
        self.fixture.write(
            "guide.md",
            "Templates: `docs/session-plans/X.Y/<session>.md`, "
            "`docs/VERSION_X_Y_PLAN.md`, and `content/changelog/vX.Y.md`.\n",
        )
        self.assertEqual([], self.rendered())

    def test_reasoned_legacy_reference_is_allowlisted(self) -> None:
        self.fixture.write(
            "DESIGN_PRINCIPLES.md",
            "Historical example: `src/features/auth/queries.ts`.\n",
        )
        self.assertEqual([], self.rendered())


if __name__ == "__main__":
    unittest.main()
