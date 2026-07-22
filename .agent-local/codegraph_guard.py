#!/usr/bin/env python3
"""Emit shared Codegraph-first guidance for Claude Code and Codex hooks."""

from __future__ import annotations

import json
import re
import sys
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


def emit(message: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": message,
    }}))


def load_tool_input() -> dict:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(payload, dict):
        return {}
    tool_input = payload.get("tool_input", payload)
    return tool_input if isinstance(tool_input, dict) else {}


def guard_bash(tool_input: dict) -> None:
    command = str(tool_input.get("command") or tool_input.get("cmd") or "")
    if SEARCH_COMMAND.search(command):
        emit(
            "MANDATORY: .codegraph/codegraph.db exists. You MUST run "
            "codegraph explore \"<question>\" for an unfamiliar area, "
            "or codegraph query \"<symbol>\" when you already know the symbol, "
            "before grepping raw files. Only grep "
            "after Codegraph has oriented you, or to modify/debug specific lines."
        )


def guard_read(tool_input: dict) -> None:
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


def main() -> int:
    if not GRAPH_PATH.is_file() or len(sys.argv) != 2:
        return 0
    tool_input = load_tool_input()
    if sys.argv[1] == "bash":
        guard_bash(tool_input)
    elif sys.argv[1] == "read":
        guard_read(tool_input)
    return 0


if __name__ == "__main__":
    sys.exit(main())
