#!/usr/bin/env python3
"""Fixture tests for the native-subagent -> Codex redirect hook."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest import mock

import redirect_subagent_to_codex as redirect


def run_hook(raw: str) -> tuple[int, str]:
    """Drive main() with raw stdin text, returning (exit code, stdout)."""
    out = io.StringIO()
    with mock.patch.object(redirect.sys, "stdin", io.StringIO(raw)), redirect_stdout(out):
        code = redirect.main()
    return code, out.getvalue()


def run_payload(payload: dict) -> tuple[int, dict | None]:
    code, text = run_hook(json.dumps(payload))
    return code, (json.loads(text) if text.strip() else None)


class RedirectSubagentTests(unittest.TestCase):
    def test_agent_call_is_redirected_to_codex(self) -> None:
        code, output = run_payload({
            "tool_name": "Agent",
            "tool_input": {"subagent_type": "Explore", "prompt": "Find callers."},
        })
        self.assertEqual(0, code)
        self.assertIsNotNone(output)
        decision = output["hookSpecificOutput"]
        self.assertEqual("deny", decision["permissionDecision"])
        reason = decision["permissionDecisionReason"]
        self.assertIn("Please re-issue this Explore", reason)
        self.assertIn("codex exec -m gpt-5.6-sol", reason)  # command inline
        self.assertIn("prompt you just wrote", reason)  # no echo; refers to context

    def test_reason_is_encouraging_not_prohibitive(self) -> None:
        # The Agent call is the trigger; prohibition language would train the
        # session to stop calling it, and the hook would never fire again.
        _, output = run_payload({
            "tool_name": "Agent",
            "tool_input": {"subagent_type": "Explore", "prompt": "p"},
        })
        reason = output["hookSpecificOutput"]["permissionDecisionReason"].lower()
        self.assertNotIn("disabled", reason)
        self.assertNotIn("do not retry", reason)
        self.assertNotIn("don't retry", reason)

    def test_effort_map_is_in_the_text(self) -> None:
        # The map lives in the text; the hook does not pre-pick an effort.
        _, output = run_payload({
            "tool_name": "Task",
            "tool_input": {"subagent_type": "Plan", "prompt": "x"},
        })
        self.assertIn(
            "opus=high, sonnet=medium, haiku=low",
            output["hookSpecificOutput"]["permissionDecisionReason"],
        )

    def test_non_subagent_tool_passes_through(self) -> None:
        code, output = run_payload({"tool_name": "Bash", "tool_input": {"command": "ls"}})
        self.assertEqual(0, code)
        self.assertIsNone(output)  # no deny emitted

    def test_allowlisted_type_passes_through(self) -> None:
        with mock.patch.object(redirect, "ALLOW_NATIVE", {"Explore"}):
            code, output = run_payload({
                "tool_name": "Agent",
                "tool_input": {"subagent_type": "Explore", "prompt": "p", "description": "d"},
            })
        self.assertEqual(0, code)
        self.assertIsNone(output)

    def test_malformed_stdin_fails_closed_to_deny(self) -> None:
        # The matcher only routes Agent/Task calls here, so denying an
        # unparseable payload blocks a subagent spawn, never other tools.
        code, text = run_hook("this is not json")
        self.assertEqual(0, code)
        self.assertIn("deny", text)


if __name__ == "__main__":
    unittest.main()
