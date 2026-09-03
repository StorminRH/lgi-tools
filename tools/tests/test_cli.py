#!/usr/bin/env python3
"""Tests for the stable visible-tool dispatcher."""

from __future__ import annotations

from contextlib import redirect_stderr
from io import StringIO
import subprocess
import unittest
from unittest.mock import patch

from tools._lib.repository import ROOT
from tools import cli


class CliTests(unittest.TestCase):
    def test_help_lists_public_groups(self) -> None:
        text = cli.usage()
        self.assertIn("lifecycle resolve", text)
        self.assertIn("quality check-env-example", text)
        self.assertIn("update-watch collector", text)
        self.assertIn("update-watch check-baseline", text)
        self.assertNotIn("poll-pr-gate", text)
        self.assertNotIn("merge-clean-pr", text)
        self.assertNotIn("fold-pending-changelog", text)
        self.assertNotIn("check-pending-changelog", text)

    def test_unknown_command_is_usage_error(self) -> None:
        with redirect_stderr(StringIO()):
            self.assertEqual(2, cli.main(["unknown", "command"]))

    def test_command_dispatches_module_with_remaining_arguments(self) -> None:
        with patch("tools.cli.subprocess.call", return_value=7) as call:
            result = cli.main(["quality", "check-env-example", "--check"])
        self.assertEqual(7, result)
        self.assertEqual(
            [
                cli.sys.executable,
                "-m",
                "tools.quality.check_env_example",
                "--check",
            ],
            call.call_args.args[0],
        )

    def test_test_command_discovers_tool_tests(self) -> None:
        with patch("tools.cli.subprocess.call", return_value=0) as call:
            self.assertEqual(0, cli.main(["test", "--failfast"]))
        self.assertEqual(
            [
                cli.sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                "tools/tests",
                "-p",
                "test_*.py",
                "--failfast",
            ],
            call.call_args.args[0],
        )

    def test_update_watch_help_runs_through_public_dispatcher(self) -> None:
        result = subprocess.run(
            [
                cli.sys.executable,
                str(ROOT / "tools/cli.py"),
                "update-watch",
                "collector",
                "--help",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("collect", result.stdout)
        self.assertIn("finalize", result.stdout)


if __name__ == "__main__":
    unittest.main()
