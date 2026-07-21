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

import hashlib
import json
import shlex
import sys
import tempfile
from pathlib import Path


# Native subagent tools this hook governs. The settings.json matcher already
# scopes the hook to these; the check is defensive against a broader match.
SUBAGENT_TOOLS = {"Agent", "Task"}

# subagent_type values allowed to run natively. Empty by design: the policy is
# "never native." Add an exact type here only for a deliberate, documented
# exception (e.g. a Claude-internals helper Codex cannot replicate).
ALLOW_NATIVE: set[str] = set()
EFFORT_BY_MODEL = {
    "opus": "high",
    "sonnet": "medium",
    "haiku": "low",
}


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


def effort_for(model: str) -> str:
    """Map the requested Claude model family to the Codex reasoning effort."""
    normalized = model.casefold()
    return next(
        (effort for family, effort in EFFORT_BY_MODEL.items() if family in normalized),
        "medium",
    )


def build_reason(subagent_type: str, prompt: str, model: str) -> str:
    """Return one complete shell-safe Codex replacement for the denied task."""
    requested = subagent_type or "subagent"
    effort = effort_for(model)
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12]
    output = Path(tempfile.gettempdir()) / f"codex-subagent-{digest}.md"
    command = " ".join(
        (
            "codex exec",
            "-m gpt-5.6-sol",
            "-c",
            shlex.quote(f'model_reasoning_effort="{effort}"'),
            "--output-last-message",
            shlex.quote(str(output)),
            shlex.quote(prompt),
        )
    )
    return (
        f"Please re-issue this {requested} as a headless gpt-5.6-sol Codex "
        f"worker by running this complete shell-safe command as a background "
        f"Bash task:\n\n  {command}\n\n"
        f"The original delegated prompt is included exactly, the final message "
        f"will be written to {output}, and the requested model maps to "
        f"reasoning effort {effort}."
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

    deny(
        build_reason(
            subagent_type,
            str(tool_input.get("prompt") or ""),
            str(tool_input.get("model") or ""),
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
