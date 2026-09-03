#!/usr/bin/env python3
"""Tests for the staging-versus-development app-facing counter."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from tools.lifecycle.count_app_facing import (
    PROMOTE_BAR,
    PROMOTE_TRIGGER,
    classify_paths,
    path_is_excluded,
    render_count,
    try_app_facing_count,
)

class CountAppFacingTests(unittest.TestCase):
    def test_docs_cursor_and_scripts_are_excluded(self) -> None:
        for path in (
            "docs/workflows/schema/changelog-entry.md",
            ".cursor/skills/start-session/SKILL.md",
            ".cursor/agents/docs-researcher.md",
            ".agents/unused.md",
            "scripts/route-classification.json",
            "content/changelog/v4.0.md",
            "AGENTS.md",
            "src/AGENTS.md",
            "CONTRIBUTING.md",
            ".fallowrc.json",
            ".github/PULL_REQUEST_TEMPLATE.md",
        ):
            self.assertTrue(path_is_excluded(path), path)
        self.assertTrue(path_is_excluded("./.cursor/skills/start-session/SKILL.md"))

    def test_runtime_tests_and_ci_are_included(self) -> None:
        for path in (
            "src/features/changelog/parse.ts",
            "convex/schema.ts",
            "tools/lifecycle/count_app_facing.py",
            ".depot/workflows/test.yml",
            "package.json",
            "content/devlog/00-introduction.md",
        ):
            self.assertFalse(path_is_excluded(path), path)

    def test_classify_totals_and_directory_breakdown(self) -> None:
        count = classify_paths(
            [
                "src/a.ts",
                "src/b.ts",
                "convex/schema.ts",
                "docs/ignored.md",
                "AGENTS.md",
            ]
        )
        self.assertEqual(3, count.app_facing)
        self.assertEqual(2, len(count.excluded))
        self.assertEqual((("src", 2), ("convex", 1)), count.by_directory)

    def test_render_handoff_line_and_promote_flag(self) -> None:
        under = classify_paths(["src/a.ts"])
        self.assertEqual(
            "app-facing 1/100\nsrc 1\nexcluded 0",
            render_count(under),
        )
        just_under = classify_paths(
            [f"src/f{index}.ts" for index in range(PROMOTE_TRIGGER - 1)]
        )
        just_under_text = render_count(just_under)
        self.assertTrue(
            just_under_text.startswith(f"app-facing {PROMOTE_TRIGGER - 1}/{PROMOTE_BAR}")
        )
        self.assertNotIn("promote is due", just_under_text)
        due = classify_paths([f"src/f{index}.ts" for index in range(PROMOTE_TRIGGER)])
        due_text = render_count(due)
        self.assertTrue(due_text.startswith(f"app-facing {PROMOTE_TRIGGER}/{PROMOTE_BAR}"))
        self.assertIn("promote is due", due_text)

    def test_unmeasurable_tree_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(try_app_facing_count(Path(tmp)))

    def test_list_appends_included_paths(self) -> None:
        count = classify_paths(["src/a.ts", "docs/x.md"])
        self.assertEqual(
            "app-facing 1/100\nsrc 1\nexcluded 1\nfiles\nsrc/a.ts",
            render_count(count, list_files=True),
        )

if __name__ == "__main__":
    unittest.main()
