#!/usr/bin/env python3
"""Tests for the staging-versus-development app-facing counter."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.lifecycle.count_app_facing import (
    PROMOTE_BAR,
    PROMOTE_TRIGGER,
    classify_paths,
    main,
    path_is_excluded,
    render_count,
    try_app_facing_count,
)

class CountAppFacingTests(unittest.TestCase):
    def test_agent_harness_files_do_not_raise_promotion_count(self) -> None:
        runtime_paths = [f"src/f{index}.ts" for index in range(PROMOTE_TRIGGER - 1)]
        agent_paths = [
            ".cursor/agents/docs-researcher.md",
            ".codex/agents/docs-researcher.toml",
            ".codex/agents/test-runner.toml",
            ".codex/config.toml",
            ".agents/skills/start-session/SKILL.md",
        ]

        count = classify_paths(runtime_paths + agent_paths)

        self.assertEqual(tuple(runtime_paths), count.included)
        self.assertEqual(tuple(agent_paths), count.excluded)
        self.assertEqual(PROMOTE_TRIGGER - 1, count.app_facing)
        self.assertNotIn("promote is due", render_count(count))

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

    def test_process_and_ci_changes_do_not_trigger_promotion(self) -> None:
        app_paths = [f"src/f{index}.ts" for index in range(PROMOTE_TRIGGER - 1)]
        process_paths = [
            ".github/workflows/test.yml",
            ".github/actions/setup-node-pnpm/action.yml",
            ".depot/workflows/test.yml",
            ".depot/actions/setup-node-pnpm/action.yml",
            ".greptile/config.json",
            ".coderabbit.yaml",
            ".agent-local/resolve_development_state.py",
            "tools/lifecycle/count_app_facing.py",
            "tools/tests/test_count_app_facing.py",
            "tools/delivery/review-policy.json",
            "e2e/probes.spec.ts",
            "e2e/fixtures.ts",
            "playwright.config.ts",
            "vitest.config.ts",
            "eslint.config.mjs",
            "docker-compose.yml",
            ".gitignore",
            "README.md",
            "CHANGELOG.md",
            "LICENSE",
        ]

        count = classify_paths(app_paths + process_paths)

        self.assertEqual(tuple(app_paths), count.included)
        self.assertEqual(tuple(process_paths), count.excluded)
        self.assertEqual(PROMOTE_TRIGGER - 1, count.app_facing)
        self.assertNotIn("promote is due", render_count(count))

    def test_app_owned_tests_content_and_runtime_config_are_included(self) -> None:
        for path in (
            "src/features/changelog/parse.ts",
            "src/features/changelog/parse.test.ts",
            "src/scripts/migrate.ts",
            "convex/schema.ts",
            "convex/engine.test.ts",
            "drizzle/0060_changes.sql",
            "public/icon.svg",
            "assets/fonts/BarlowCondensed-Bold.ttf",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            "next.config.ts",
            "tsconfig.json",
            "postcss.config.mjs",
            "vercel.json",
            "neon.ts",
            "drizzle.config.ts",
            ".env.example",
            "content/devlog/00-introduction.md",
            "content/devlog/README.md",
        ):
            with self.subTest(path=path):
                self.assertFalse(path_is_excluded(path))

    def test_process_exclusions_respect_ownership_boundaries_and_normalization(self) -> None:
        count = classify_paths([
            r".\.github\workflows\test.yml",
            "./tools/cli.py",
            ".github-app/config.json",
            "toolshed/runtime.py",
            "src/tools/runtime.ts",
            "src/fixtures/vitest.config.ts",
        ])
        self.assertEqual(
            (".github/workflows/test.yml", "tools/cli.py"), count.excluded,
        )
        self.assertEqual(
            (".github-app/config.json", "toolshed/runtime.py",
             "src/tools/runtime.ts", "src/fixtures/vitest.config.ts"),
            count.included,
        )

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

    def test_cli_has_no_hard_cap_above_reference_scale(self) -> None:
        paths = [f"src/f{index}.ts" for index in range(PROMOTE_BAR + 1)]
        output = StringIO()
        with patch("tools.lifecycle.count_app_facing.list_changed_paths", return_value=paths):
            with redirect_stdout(output):
                result = main([])
        self.assertEqual(0, result)
        self.assertIn(f"app-facing {PROMOTE_BAR + 1}/{PROMOTE_BAR}", output.getvalue())
        self.assertIn("promote is due", output.getvalue())

    def test_list_appends_included_paths(self) -> None:
        count = classify_paths(["src/a.ts", "docs/x.md"])
        self.assertEqual(
            "app-facing 1/100\nsrc 1\nexcluded 1\nfiles\nsrc/a.ts",
            render_count(count, list_files=True),
        )

if __name__ == "__main__":
    unittest.main()
