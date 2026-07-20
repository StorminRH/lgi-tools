#!/usr/bin/env python3
"""Fixture tests for the repository document-reference checker."""

from __future__ import annotations

import json
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

    def test_bracketed_route_path_resolves_literally(self) -> None:
        page = self.fixture.root / "src/app/sites/[id]/page.tsx"
        page.parent.mkdir(parents=True)
        page.write_text("export {};\n", encoding="utf-8")
        self.fixture.write("guide.md", "See `src/app/sites/[id]/page.tsx`.\n")
        self.assertEqual([], self.rendered())

    def test_missing_bracketed_route_path_is_an_error(self) -> None:
        self.fixture.write("guide.md", "See `src/app/sites/[slug]/page.tsx`.\n")
        self.assertEqual(
            [
                (
                    "error",
                    "docs/guide.md:1: repository path does not resolve: "
                    "src/app/sites/[slug]/page.tsx",
                )
            ],
            self.rendered(),
        )

    def test_manifest_declared_ignored_outputs_need_not_exist(self) -> None:
        manifest_path = self.fixture.root / ".agent-local/policy-manifest.json"
        manifest_path.parent.mkdir(parents=True)
        manifest_path.write_text(
            json.dumps({"ignoredPaths": ["docs/generated/"]}),
            encoding="utf-8",
        )
        self.fixture.write(
            "guide.md",
            "Future outputs: `docs/generated/report.json` and `docs/generated/*.png`.\n",
        )
        self.assertEqual([], self.rendered())

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

    def test_record_sources_suppress_repository_path_errors(self) -> None:
        record_sources = (
            "session-plans/3.10/3.10.0.1.md",
            "session-contracts/3.10/nested/contract.md",
            "version-audits/3.10/PLAN.md",
            "SCRATCHPAD.md",
            "VERSION_3_10_PLAN.md",
            "backlog.md",
            "CODE_HEALTH_BASELINE.md",
        )
        for source in record_sources:
            with self.subTest(source=source):
                self.fixture.write(source, "Future record: `docs/not-created-yet.md`.\n")
                self.assertEqual([], self.rendered())

    def test_record_source_archive_redirect_still_warns(self) -> None:
        self.fixture.write(
            "VERSION_3_10_PLAN.md",
            "Historical evidence: `docs/SCALING_AUDIT_FINDINGS.md`.\n",
        )
        self.assertEqual(
            [
                (
                    "warn",
                    "docs/VERSION_3_10_PLAN.md:1: archive reference does not resolve: "
                    "../LGI Tools Document Archive/SCALING_AUDIT_FINDINGS.md",
                )
            ],
            self.rendered(),
        )

    def test_record_source_relative_reference_still_warns(self) -> None:
        self.fixture.write("backlog.md", "Future archive: `../missing`.\n")
        self.assertEqual(
            [
                (
                    "warn",
                    "docs/backlog.md:1: archive reference does not resolve: ../missing",
                )
            ],
            self.rendered(),
        )

    def test_non_record_source_still_reports_repository_path_errors(self) -> None:
        self.fixture.write("CONVEX.md", "See `docs/not-created-yet.md`.\n")
        self.assertEqual(
            [
                (
                    "error",
                    "docs/CONVEX.md:1: repository path does not resolve: "
                    "docs/not-created-yet.md",
                )
            ],
            self.rendered(),
        )


if __name__ == "__main__":
    unittest.main()
