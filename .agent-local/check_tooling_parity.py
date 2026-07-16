#!/usr/bin/env python3
"""Validate cross-runtime developer tooling parity for LGI.tools."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from audit_tooling_parity import HOME, ROOT, build_report
from sync_vercel_plugin import DEFAULT_AGENTS_TARGET, DEFAULT_SOURCE, DEFAULT_TARGET, check


REQUIRED_PATH_COMMANDS = ("node", "pnpm", "ctx7", "vercel", "neon", "gh", "graphify")
REQUIRED_CODEX_AGENTS = (
    "ai-architect.toml",
    "deployment-expert.toml",
    "performance-optimizer.toml",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def config_sections(report: dict, runtime: str) -> set[str]:
    sections: set[str] = set()
    for config in report[runtime]["configs"]:
        sections.update(config.get("sections", []))
    return sections


def enabled_plugins(report: dict, runtime: str) -> set[str]:
    plugins: set[str] = set()
    for config in report[runtime]["configs"]:
        plugins.update(config.get("enabledPlugins_names", []))
    return plugins


def main() -> int:
    report = build_report()
    errors: list[str] = []

    for command in REQUIRED_PATH_COMMANDS:
        if not report["cli"][command]["path"]:
            errors.append(f"shared CLI is missing from PATH: {command}")
    if not report["cli"]["playwright"]["repo_bin"]:
        errors.append("Playwright is not available from repo-local node_modules/.bin")

    claude_find_docs = HOME / ".claude/skills/find-docs/SKILL.md"
    codex_find_docs = HOME / ".agents/skills/find-docs/SKILL.md"
    if not claude_find_docs.is_file() or not codex_find_docs.is_file():
        errors.append("find-docs must exist in both user skill trees")
    elif digest(claude_find_docs) != digest(codex_find_docs):
        errors.append("Claude and Codex find-docs skills differ")

    if "vercel-plugin@vercel" not in enabled_plugins(report, "claude"):
        errors.append("Claude Vercel plugin is not enabled")
    if 'plugins."vercel-plugin@personal"' not in config_sections(report, "codex"):
        errors.append("Codex personal Vercel adapter is not installed/enabled")

    errors.extend(check(DEFAULT_SOURCE, DEFAULT_TARGET, DEFAULT_AGENTS_TARGET))
    target_manifest = DEFAULT_TARGET / ".codex-plugin/plugin.json"
    if target_manifest.is_file():
        target_version = json.loads(target_manifest.read_text(encoding="utf-8"))["version"]
        installed = HOME / ".codex/plugins/cache/personal/vercel-plugin" / target_version
        if not installed.is_dir():
            errors.append(
                "Codex Vercel plugin source is newer than the installed cache; "
                "run `codex plugin add vercel-plugin@personal`"
            )
    for agent_name in REQUIRED_CODEX_AGENTS:
        if not (DEFAULT_AGENTS_TARGET / agent_name).is_file():
            errors.append(f"missing user-global Codex Vercel agent: {agent_name}")

    claude_guide = HOME / ".claude/CLAUDE.md"
    codex_guide = HOME / ".codex/AGENTS.md"
    if not claude_guide.is_file() or "/vercel-plugin:*" not in claude_guide.read_text(encoding="utf-8"):
        errors.append("global Claude guide is missing native Vercel invocation guidance")
    if not codex_guide.is_file():
        errors.append("missing global Codex AGENTS.md")
    else:
        codex_text = codex_guide.read_text(encoding="utf-8")
        for required in ("vercel-deploy", "custom agents", "sync_vercel_plugin.py --check"):
            if required not in codex_text:
                errors.append(f"global Codex guide is missing Vercel adapter policy: {required}")

    if errors:
        print(f"tooling parity check failed ({len(errors)} finding(s)):")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "tooling parity check passed: shared CLIs available, find-docs identical, "
        "Vercel plugin synced, 3 Codex specialists present"
    )
    print(
        "intentional native differences: Claude slash commands/session hook; "
        "Codex command skills/global guidance; Codex built-in app plugins/MCP"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
