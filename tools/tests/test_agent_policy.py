#!/usr/bin/env python3
"""Fixture tests for the repository-only agent policy checker."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from tools.policy.check_agent_policy import (
    _hook_commands,
    check_canonical_guides,
    check_hooks,
    check_ignored,
    check_legacy_entrypoints,
    check_paths,
    check_procedure_policies,
)


class PolicyFixture:
    """Small disposable repository-policy tree."""

    def __init__(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def close(self) -> None:
        self.temp.cleanup()

    def write(self, path: str, text: str) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")


class AgentPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = PolicyFixture()
        self.addCleanup(self.fixture.close)

    def test_required_and_forbidden_paths_are_repository_owned(self) -> None:
        self.fixture.write("required.txt", "present\n")
        self.fixture.write("forbidden.txt", "present\n")
        errors: list[str] = []
        check_paths(
            {
                "requiredPaths": ["required.txt", "missing.txt"],
                "forbiddenPaths": ["forbidden.txt"],
            },
            self.fixture.root,
            errors,
        )
        self.assertEqual(
            [
                "missing required path: missing.txt",
                "forbidden path exists: forbidden.txt",
            ],
            errors,
        )

    def test_canonical_guides_and_import_only_harness_guides(self) -> None:
        self.fixture.write("AGENTS.md", "# Guide\n")
        self.fixture.write("CLAUDE.md", "@AGENTS.md\n")
        errors: list[str] = []
        check_canonical_guides(
            {
                "canonicalGuides": ["AGENTS.md"],
                "harnessGuideImports": {"CLAUDE.md": "@AGENTS.md"},
            },
            self.fixture.root,
            errors,
        )
        self.assertEqual([], errors)

    def test_canonical_guide_and_harness_drift_are_rejected(self) -> None:
        self.fixture.write("CLAUDE.md", "@AGENTS.md\nextra policy\n")
        errors: list[str] = []
        check_canonical_guides(
            {
                "canonicalGuides": ["missing.md"],
                "harnessGuideImports": {"CLAUDE.md": "@AGENTS.md"},
            },
            self.fixture.root,
            errors,
        )
        self.assertEqual(2, len(errors))

    def test_procedure_policy_checks_order_and_runtime_neutrality(self) -> None:
        self.fixture.write("docs/workflows/review.md", "Freeze\nLaunch\nCursor\n")
        errors: list[str] = []
        check_procedure_policies(
            {
                "procedurePolicies": {
                    "docs/workflows/review.md": {
                        "orderedRequired": ["Launch", "Freeze"],
                        "forbidden": ["Cursor"],
                    }
                }
            },
            self.fixture.root,
            errors,
        )
        self.assertEqual(2, len(errors))

    def test_legacy_entrypoint_must_be_thin_and_dispatch_visible_tool(self) -> None:
        self.fixture.write(
            ".agent-local/resolve_development_state.py",
            "from pathlib import Path\n"
            "import subprocess\n"
            "import sys\n"
            "ROOT = Path(__file__).resolve().parents[1]\n"
            "subprocess.call([sys.executable, str(ROOT / 'tools/cli.py'), 'lifecycle', "
            "'resolve', *sys.argv[1:]], cwd=ROOT)\n",
        )
        errors: list[str] = []
        check_legacy_entrypoints(
            {
                "legacyEntrypoints": {
                    ".agent-local/resolve_development_state.py": [
                        "lifecycle",
                        "resolve",
                    ]
                }
            },
            self.fixture.root,
            errors,
        )
        self.assertEqual([], errors)

    def test_legacy_entrypoint_rejects_hidden_implementation(self) -> None:
        self.fixture.write(
            ".agent-local/check.py",
            "\n".join(["implementation"] * 36),
        )
        errors: list[str] = []
        check_legacy_entrypoints(
            {"legacyEntrypoints": {".agent-local/check.py": ["policy", "check"]}},
            self.fixture.root,
            errors,
        )
        self.assertEqual(2, len(errors))

    def test_legacy_entrypoint_rejects_wrong_dispatch(self) -> None:
        self.fixture.write(
            ".agent-local/check.py",
            "from pathlib import Path\n"
            "import subprocess\n"
            "import sys\n"
            "ROOT = Path(__file__).resolve().parents[1]\n"
            "subprocess.call([sys.executable, str(ROOT / 'tools/cli.py'), 'lifecycle', "
            "'resolve', *sys.argv[1:]], cwd=ROOT)\n",
        )
        errors: list[str] = []
        check_legacy_entrypoints(
            {"legacyEntrypoints": {".agent-local/check.py": ["policy", "check"]}},
            self.fixture.root,
            errors,
        )
        self.assertEqual(1, len(errors))

    def test_hook_commands_are_exact(self) -> None:
        self.fixture.write(
            ".codex/hooks.json",
            json.dumps({"hooks": {"PreToolUse": [{"command": "root-safe"}]}}),
        )
        errors: list[str] = []
        check_hooks(
            {"hookCommands": {".codex/hooks.json": ["root-safe"]}},
            self.fixture.root,
            errors,
        )
        self.assertEqual([], errors)

    def test_ignore_check_surfaces_git_failure(self) -> None:
        errors: list[str] = []
        result = subprocess.CompletedProcess(
            args=["git", "check-ignore"],
            returncode=2,
            stdout="",
            stderr="not a work tree",
        )
        with patch(
            "tools.policy.check_agent_policy.subprocess.run",
            return_value=result,
        ):
            check_ignored({"ignoredPaths": [".agents/local-only"]}, errors)
        self.assertEqual(
            ["git check-ignore failed: not a work tree"],
            errors,
        )

if __name__ == "__main__":
    unittest.main()
