#!/usr/bin/env python3
"""Emit shared Codegraph-first guidance for Claude Code and Codex hooks.

The reminder fires once per session — on the first source search or read — and
then stays silent for the rest of that session, so the guidance appears when it
is useful instead of on every subsequent source read. The per-session marker
records only that the reminder has already been shown; the guard never tries to
infer whether Codegraph was actually consulted (a hook cannot observe that
reliably). Sessions are keyed by the ``session_id`` the hook receives on stdin;
when that is absent (a caller that does not provide it) the guard falls back to
reminding every time rather than going silent.
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
SOURCE_EXTENSIONS = (
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java",
    ".rb", ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".kt",
    ".swift", ".php", ".scala", ".lua", ".sh", ".md", ".rst",
    ".txt", ".mdx",
)

# One per-session marker (a 0-byte file the OS reclaims) records that this
# session has already seen the reminder, so it fires only once.
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
    return MARKER_DIR / f"codegraph-guard-reminded-{safe}"


def already_reminded(marker: Path | None) -> bool:
    return marker is not None and marker.is_file()


def mark_reminded(marker: Path | None) -> None:
    if marker is None:
        return
    try:
        marker.touch()
    except OSError:
        pass


def guard_bash(tool_input: dict, marker: Path | None) -> None:
    if already_reminded(marker):
        return
    command = str(tool_input.get("command") or tool_input.get("cmd") or "")
    if SEARCH_COMMAND.search(command):
        emit(
            "MANDATORY: .codegraph/codegraph.db exists. You MUST run "
            "codegraph explore \"<question>\" for an unfamiliar area, "
            "or codegraph query \"<symbol>\" when you already know the symbol, "
            "before grepping raw files. Only grep "
            "after Codegraph has oriented you, or to modify/debug specific lines."
        )
        mark_reminded(marker)


def guard_read(tool_input: dict, marker: Path | None) -> None:
    if already_reminded(marker):
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
        mark_reminded(marker)


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
