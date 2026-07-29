#!/usr/bin/env python3
"""Focused fixtures for the cross-runtime tooling parity gate."""

from __future__ import annotations

from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import check_tooling_parity


class ToolingParityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        self.codex_agents = self.home / ".codex/agents"
        self.codex_agents.mkdir(parents=True)
        for agent_name in check_tooling_parity.REQUIRED_CODEX_AGENTS:
            (self.codex_agents / agent_name).write_text("fixture\n", encoding="utf-8")

        claude_skill = self.home / ".claude/skills/find-docs/SKILL.md"
        codex_skill = self.home / ".agents/skills/find-docs/SKILL.md"
        claude_skill.parent.mkdir(parents=True)
        codex_skill.parent.mkdir(parents=True)
        claude_skill.write_text("fixture\n", encoding="utf-8")
        codex_skill.write_text("fixture\n", encoding="utf-8")
        claude_guide = self.home / ".claude/CLAUDE.md"
        claude_guide.write_text("Use /vercel-plugin:* commands.\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_global_codex_guide_is_not_required(self) -> None:
        report = {
            "cli": {
                command: {"path": f"/fixture/{command}", "repo_bin": None}
                for command in check_tooling_parity.REQUIRED_PATH_COMMANDS
            },
            "claude": {
                "configs": [{"enabledPlugins_names": ["vercel-plugin@vercel"]}]
            },
            "codex": {
                "configs": [{"sections": ['plugins."vercel-plugin@personal"']}]
            },
        }
        report["cli"]["playwright"] = {
            "path": None,
            "repo_bin": "/fixture/playwright",
        }

        output = io.StringIO()
        with (
            patch.object(check_tooling_parity, "HOME", self.home),
            patch.object(
                check_tooling_parity,
                "DEFAULT_SOURCE",
                self.home / "claude-vercel-plugin",
            ),
            patch.object(
                check_tooling_parity,
                "DEFAULT_TARGET",
                self.home / "codex-vercel-plugin",
            ),
            patch.object(
                check_tooling_parity,
                "DEFAULT_AGENTS_TARGET",
                self.codex_agents,
            ),
            patch.object(check_tooling_parity, "build_report", return_value=report),
            patch.object(check_tooling_parity, "check", return_value=[]),
            redirect_stdout(output),
        ):
            result = check_tooling_parity.main()

        self.assertEqual(result, 0)
        self.assertIn("tooling parity check passed", output.getvalue())


if __name__ == "__main__":
    unittest.main()
