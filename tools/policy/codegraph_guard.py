#!/usr/bin/env python3
"""Emit shared Codegraph-first guidance for agent-harness hooks.

The reminder fires once per session — on the first source search or read — and
then stays silent for the rest of that session, so the guidance appears when it
is useful instead of on every subsequent source read. The per-session marker
records only that the reminder has already been shown; the guard never tries to
infer whether Codegraph was actually consulted (a hook cannot observe that
reliably). Sessions are keyed by the harness session or conversation identifier
received on stdin.

Claude and Codex paths inject additionalContext and, when no session identifier
is present, fall back to reminding every time rather than going silent. Cursor
preToolUse can only deliver agent_message on deny, so Cursor mode emits a
deny-once reminder only after creating a durable marker and otherwise fails
open with no reminder — a missing identifier must not permanently block tools.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path


# Anchored to this file, not the process cwd: hook commands inherit the
# session's persisted working directory, which is not always the repo root.
from tools._lib.repository import ROOT

GRAPH_PATH = ROOT / ".codegraph/codegraph.db"
SEARCH_COMMAND = re.compile(
    r"(^|[\s;&|])(grep|rg|ripgrep|find|fd|ack|ag)(?=\s|$)",
    flags=re.IGNORECASE,
)
SOURCE_EXTENSIONS = (
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java",
    ".rb", ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".kt",
    ".swift", ".php", ".scala", ".lua", ".sh", ".md", ".rst",
    ".txt", ".mdx",
)

# One per-session marker (a 0-byte file the OS reclaims) records that this
# session has already seen the reminder, so it fires only once.
MARKER_DIR = Path(tempfile.gettempdir())


def emit(message: str, cursor_native: bool = False) -> None:
    if cursor_native:
        # Cursor preToolUse feeds agent_message to the model only on deny.
        # Claim the session marker before this call so a retry is silent and
        # fails open (empty stdout), which lets the same tool proceed once.
        print(json.dumps({"permission": "deny", "agent_message": message}))
        return
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "additionalContext": message,
                }
            }
        )
    )


def marker_path(session_id: str) -> Path | None:
    # Hash rather than strip unsafe characters: stripping is lossy, so two
    # distinct sessions ("a/b" and "ab") could share a marker and one could
    # suppress the other's reminder.
    if not session_id:
        return None
    digest = hashlib.sha256(session_id.encode("utf-8")).hexdigest()
    return MARKER_DIR / f"codegraph-guard-reminded-{digest}"


def claim_reminder(marker: Path | None) -> bool:
    """True if this call should show the reminder.

    Creating the per-session marker atomically (exclusive create) claims it, so
    when several hooks race only the one that creates the file emits — a plain
    exists-check-then-touch would let both emit before either marker exists.
    With no marker (no session id) there is nothing to dedupe on, so every call
    reminds.
    """
    if marker is None:
        return True
    try:
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    except OSError:
        return True
    os.close(fd)
    return True


def cursor_may_deny(marker: Path | None) -> bool:
    """True when Cursor can deny once and later fail open on retry.

    Cursor delivers agent_message only with permission deny. Without a durable
    session marker, claim_reminder stays true forever, so a deny would loop.
    Skip the reminder unless this call creates the marker file.
    """
    if marker is None or not claim_reminder(marker):
        return False
    return marker.is_file()


def guard_bash(
    tool_input: dict, marker: Path | None, cursor_native: bool = False
) -> None:
    command = str(tool_input.get("command") or tool_input.get("cmd") or "")
    if not SEARCH_COMMAND.search(command):
        return
    if cursor_native:
        if not cursor_may_deny(marker):
            return
    elif not claim_reminder(marker):
        return
    emit(
        "MANDATORY: .codegraph/codegraph.db exists. You MUST run "
        "the global map-codebase skill through a fresh repo-mapper subagent, "
        "or in this context when native subagents are unavailable. Prefer "
        "Codegraph MCP codegraph_explore when available, or "
        "codegraph explore \"<question>\" via the CLI, for an unfamiliar "
        "area; use CLI-only codegraph query \"<symbol>\" when you already "
        "know the symbol, before grepping raw files. Only grep after "
        "Codegraph has oriented you, or to modify/debug specific lines.",
        cursor_native,
    )


def guard_read(
    tool_input: dict, marker: Path | None, cursor_native: bool = False
) -> None:
    candidate = " ".join(
        str(tool_input.get(key) or "") for key in ("file_path", "pattern", "path")
    ).lower().replace("\\", "/")
    if ".codegraph/" in candidate:
        return
    if not any(extension in candidate for extension in SOURCE_EXTENSIONS):
        return
    if cursor_native:
        if not cursor_may_deny(marker):
            return
    elif not claim_reminder(marker):
        return
    emit(
        "MANDATORY: .codegraph/codegraph.db exists. Obtain a current "
        "map-codebase evidence packet from a fresh repo-mapper subagent before "
        "reading source files, or run the skill in this context when native "
        "subagents are unavailable. Prefer Codegraph MCP codegraph_explore "
        "when available, or CLI `codegraph explore \"<question>\"`. Use "
        "CLI-only `codegraph query \"<symbol>\"`, "
        "`codegraph callers \"<symbol>\"`, or `codegraph impact \"<symbol>\"` "
        "for relationship lookups the MCP surface does not expose. Only "
        "read raw files after Codegraph has oriented the task, or to "
        "modify/debug specific lines.",
        cursor_native,
    )


def load_payload() -> dict:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return {}
    return payload if isinstance(payload, dict) else {}


def main() -> int:
    if not GRAPH_PATH.is_file() or len(sys.argv) != 2:
        return 0
    payload = load_payload()
    tool_input = payload.get("tool_input", payload)
    if not isinstance(tool_input, dict):
        tool_input = {}
    mode = sys.argv[1]
    marker = marker_path(
        str(payload.get("session_id") or payload.get("conversation_id") or "")
    )
    if mode == "bash":
        guard_bash(tool_input, marker)
    elif mode == "read":
        guard_read(tool_input, marker)
    elif mode == "cursor":
        tool_name = str(payload.get("tool_name") or "").lower()
        if tool_name == "shell":
            guard_bash(tool_input, marker, cursor_native=True)
        elif tool_name in {"read", "grep", "glob"}:
            guard_read(tool_input, marker, cursor_native=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
