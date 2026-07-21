#!/usr/bin/env python3
"""Deny native Claude subagents and redirect the work to a headless Codex worker.

LGI policy is "every subagent is a headless `gpt-5.6-sol` Codex worker, never a
native Claude agent." This Claude-only `PreToolUse` hook makes that a mechanical
gate instead of prose: it intercepts a native Agent/Task call and returns an
instruction to relaunch that same work as a background `codex exec` task — the
command and the model->effort map inline, pointing the worker at the prompt the
caller just wrote. It cannot run Codex itself — `PreToolUse` hooks gate and give
feedback, they cannot fabricate a tool result — so the redirect relies on the
session following the instruction.

The reason is phrased as a positive instruction, never a prohibition
("disabled" / "do not retry the tool"): the Agent/Task call is the intended
trigger, and prohibition language would train the session to stop calling it,
which would stop the hook from ever firing. Keep it encouraging.

Wired for Claude only (see `.claude/settings.json`); Codex has no native Claude
Agent tool to redirect, so there is deliberately no `.codex/hooks.json` peer.
"""

from __future__ import annotations

import json
import sys


# Native subagent tools this hook governs. The settings.json matcher already
# scopes the hook to these; the check is defensive against a broader match.
SUBAGENT_TOOLS = {"Agent", "Task"}

# subagent_type values allowed to run natively. Empty by design: the policy is
# "never native." Add an exact type here only for a deliberate, documented
# exception (e.g. a Claude-internals helper Codex cannot replicate).
ALLOW_NATIVE: set[str] = set()


def load_payload() -> dict:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return {}
    return payload if isinstance(payload, dict) else {}


def deny(reason: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))


def build_reason(subagent_type: str) -> str:
    requested = subagent_type or "subagent"
    return (
        f"Please re-issue this {requested} as a headless gpt-5.6-sol Codex "
        f"worker: run a background Bash task that feeds the prompt you just wrote "
        f"to\n\n"
        f"  codex exec -m gpt-5.6-sol -c model_reasoning_effort=\"<effort>\" "
        f"--output-last-message <file>\n\n"
        f"and title it `gpt-5.6-sol@<effort>: <purpose>`. Set <effort> from the "
        f"model of the agent you called: opus=high, sonnet=medium, haiku=low "
        f"(xhigh only if required)."
    )


def main() -> int:
    payload = load_payload()
    tool_name = str(payload.get("tool_name") or "")
    if tool_name and tool_name not in SUBAGENT_TOOLS:
        return 0

    tool_input = payload.get("tool_input")
    tool_input = tool_input if isinstance(tool_input, dict) else {}
    subagent_type = str(tool_input.get("subagent_type") or "")
    if subagent_type in ALLOW_NATIVE:
        return 0

    deny(build_reason(subagent_type))
    return 0


if __name__ == "__main__":
    sys.exit(main())
