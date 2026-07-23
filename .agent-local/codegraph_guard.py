#!/usr/bin/env python3
"""Emit shared Codegraph-first guidance for Claude Code and Codex hooks.

The guidance fires until the session has oriented via Codegraph, then goes
silent. The first time a ``codegraph`` command runs in a session, a per-session
marker is written and every later grep/read nudge for that session is
suppressed — so the reminder appears once, when it is useful, instead of on
every subsequent source read. Sessions are keyed by the ``session_id`` the hook
receives on stdin; when that is absent (a caller that does not provide it) the
guard degrades to the old always-nudge behavior rather than over-suppressing.
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path


# Anchored to this file, not the process cwd: hook commands inherit the
# session's persisted working directory, which is not always the repo root.
GRAPH_PATH = Path(__file__).resolve().parents[1] / ".codegraph/codegraph.db"
SEARCH_COMMAND = re.compile(
    r"(^|[\s;&|])(grep|rg|ripgrep|find|fd|ack|ag)(?=\s|$)",
    flags=re.IGNORECASE,
)
# A real codegraph invocation IS orientation — recognizing it lets the guard
# fall quiet for the rest of the session. Match only codegraph in COMMAND
# position (start of the command or right after a shell separator) followed by a
# subcommand, so a command that merely mentions the word — `echo codegraph`,
# `grep codegraph` — does not falsely mark the session oriented.
CODEGRAPH_COMMAND = re.compile(
    r"(?:^|[;&|(\n])\s*codegraph\s+[a-z]",
    flags=re.IGNORECASE,
)
SOURCE_EXTENSIONS = (
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java",
    ".rb", ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".kt",
    ".swift", ".php", ".scala", ".lua", ".sh", ".md", ".rst",
    ".txt", ".mdx",
)

# Per-session orientation markers live in the system temp dir (0-byte files the
# OS reclaims on its own); one per session_id.
MARKER_DIR = Path(tempfile.gettempdir())


def emit(message: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": message,
    }}))


def marker_path(session_id: str) -> Path | None:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", session_id or "")
    if not safe:
        return None
    return MARKER_DIR / f"codegraph-guard-oriented-{safe}"


def is_oriented(marker: Path | None) -> bool:
    return marker is not None and marker.is_file()


def mark_oriented(marker: Path | None) -> None:
    if marker is None:
        return
    try:
        marker.touch()
    except OSError:
        pass


def guard_bash(tool_input: dict, marker: Path | None) -> None:
    command = str(tool_input.get("command") or tool_input.get("cmd") or "")
    # Running codegraph is the orientation we want — record it and stay silent.
    if CODEGRAPH_COMMAND.search(command):
        mark_oriented(marker)
        return
    if is_oriented(marker):
        return
    if SEARCH_COMMAND.search(command):
        emit(
            "MANDATORY: .codegraph/codegraph.db exists. You MUST run "
            "codegraph explore \"<question>\" for an unfamiliar area, "
            "or codegraph query \"<symbol>\" when you already know the symbol, "
            "before grepping raw files. Only grep "
            "after Codegraph has oriented you, or to modify/debug specific lines."
        )


def guard_read(tool_input: dict, marker: Path | None) -> None:
    if is_oriented(marker):
        return
    candidate = " ".join(
        str(tool_input.get(key) or "") for key in ("file_path", "pattern", "path")
    ).lower().replace("\\", "/")
    if ".codegraph/" in candidate:
        return
    if any(extension in candidate for extension in SOURCE_EXTENSIONS):
        emit(
            "MANDATORY: .codegraph/codegraph.db exists. You MUST run Codegraph "
            "before reading source files. Use: `codegraph explore \"<question>\"` "
            "(relevant symbols and call paths), `codegraph query \"<symbol>\"`, or "
            "`codegraph callers \"<symbol>\"` / `codegraph impact \"<symbol>\"`. Only "
            "read raw files after Codegraph has oriented you, or to modify/debug "
            "specific lines. This rule applies to subagents too—include it in every "
            "subagent prompt involving code exploration."
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
    marker = marker_path(str(payload.get("session_id") or ""))
    if sys.argv[1] == "bash":
        guard_bash(tool_input, marker)
    elif sys.argv[1] == "read":
        guard_read(tool_input, marker)
    return 0


if __name__ == "__main__":
    sys.exit(main())
