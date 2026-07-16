#!/usr/bin/env python3
"""Audit Claude Code/Codex tooling parity without reading credential values.

Outputs a sanitized JSON capability inventory. Values from agent configuration
files are never emitted; only file paths, section/key names, counts, and command
resolution/version information are included.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
HOME = Path.home()
DEFAULT_OUTPUT = ROOT / ".agent-local/tooling-parity-report.json"
CLI_NAMES = (
    "claude",
    "codex",
    "node",
    "pnpm",
    "npx",
    "ctx7",
    "vercel",
    "neon",
    "neonctl",
    "gh",
    "graphify",
    "playwright",
    "python3",
)
VERSION_ARGS = {
    "claude": ("--version",),
    "codex": ("--version",),
    "node": ("--version",),
    "pnpm": ("--version",),
    "npx": ("--version",),
    "ctx7": ("--version",),
    "vercel": ("--version",),
    "neon": ("--version",),
    "neonctl": ("--version",),
    "gh": ("--version",),
    "graphify": ("--version",),
    "playwright": ("--version",),
    "python3": ("--version",),
}


def relative_or_home(path: Path) -> str:
    try:
        return f"$REPO/{path.relative_to(ROOT).as_posix()}"
    except ValueError:
        pass
    try:
        return f"$HOME/{path.relative_to(HOME).as_posix()}"
    except ValueError:
        return str(path)


def first_line(value: str) -> str:
    return next((line.strip() for line in value.splitlines() if line.strip()), "")


def command_version(path: str, name: str) -> str | None:
    result = subprocess.run(
        [path, *VERSION_ARGS[name]],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=10,
    )
    line = first_line(result.stdout) or first_line(result.stderr)
    return line[:200] or None


def cli_inventory() -> dict[str, Any]:
    declared: set[str] = set()
    package_path = ROOT / "package.json"
    if package_path.is_file():
        package = json.loads(package_path.read_text(encoding="utf-8"))
        declared |= set(package.get("dependencies", {}))
        declared |= set(package.get("devDependencies", {}))

    result: dict[str, Any] = {}
    for name in CLI_NAMES:
        resolved = shutil.which(name)
        local = ROOT / "node_modules/.bin" / name
        result[name] = {
            "path": relative_or_home(Path(resolved)) if resolved else None,
            "version": command_version(resolved, name) if resolved else None,
            "repo_bin": relative_or_home(local) if local.exists() else None,
            "package_declared": name in declared,
        }
    return result


def parse_skill_name(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return path.parent.name
    match = re.search(r"^name:\s*[\"']?([^\n\"']+)", text, flags=re.MULTILINE)
    return match.group(1).strip() if match else path.parent.name


def skills_under(root: Path, max_depth: int = 6) -> list[dict[str, str]]:
    if not root.is_dir():
        return []
    skills: list[dict[str, str]] = []
    base_depth = len(root.parts)
    for path in root.rglob("SKILL.md"):
        if len(path.parts) - base_depth > max_depth:
            continue
        skills.append({"name": parse_skill_name(path), "path": relative_or_home(path)})
    return sorted(skills, key=lambda item: (item["name"].lower(), item["path"]))


def markdown_commands(root: Path) -> list[str]:
    if not root.is_dir():
        return []
    return sorted(relative_or_home(path) for path in root.rglob("*.md"))


def child_names(root: Path) -> list[str]:
    if not root.is_dir():
        return []
    return sorted(path.name for path in root.iterdir() if not path.name.startswith("."))


def nested_map_names(value: Any, key_name: str) -> set[str]:
    names: set[str] = set()
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == key_name and isinstance(nested, dict):
                names.update(str(name) for name in nested)
            names.update(nested_map_names(nested, key_name))
    elif isinstance(value, list):
        for nested in value:
            names.update(nested_map_names(nested, key_name))
    return names


def json_summary(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return {"path": relative_or_home(path), "error": type(exc).__name__}
    summary: dict[str, Any] = {
        "path": relative_or_home(path),
        "top_level_keys": sorted(data) if isinstance(data, dict) else [],
    }
    if isinstance(data, dict):
        nested_mcp = nested_map_names(data, "mcpServers")
        if nested_mcp:
            summary["nested_mcp_server_names"] = sorted(nested_mcp)
        for key in ("mcpServers", "plugins", "enabledPlugins"):
            value = data.get(key)
            if isinstance(value, dict):
                summary[f"{key}_names"] = sorted(str(name) for name in value)
            elif isinstance(value, list):
                summary[f"{key}_count"] = len(value)
        hooks = data.get("hooks")
        if isinstance(hooks, dict):
            summary["hook_events"] = {
                str(event): len(entries) if isinstance(entries, list) else 1
                for event, entries in hooks.items()
            }
    return summary


def toml_summary(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return {"path": relative_or_home(path), "error": type(exc).__name__}
    sections = re.findall(r"^\s*\[([^\]]+)\]\s*$", text, flags=re.MULTILINE)
    root_keys = re.findall(r"^([A-Za-z0-9_.-]+)\s*=", text, flags=re.MULTILINE)
    return {
        "path": relative_or_home(path),
        "sections": sorted(set(sections)),
        "root_key_names": sorted(set(root_keys)),
    }


def plugin_inventory(root: Path) -> dict[str, Any]:
    if not root.is_dir():
        return {"root": relative_or_home(root), "present": False}
    manifests: list[str] = []
    bundles: list[dict[str, Any]] = []
    skill_count = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name in {"plugin.json", "marketplace.json", "installed_plugins.json"}:
            manifests.append(relative_or_home(path))
            if path.name == "plugin.json" and path.parent.name in {
                ".claude-plugin",
                ".codex-plugin",
            }:
                plugin_root = path.parent.parent
                bundles.append(
                    {
                        "root": relative_or_home(plugin_root),
                        "skills": [
                            item["name"] for item in skills_under(plugin_root / "skills")
                        ],
                        "agents": markdown_commands(plugin_root / "agents"),
                        "commands": markdown_commands(plugin_root / "commands"),
                        "top_level": child_names(plugin_root),
                    }
                )
        elif path.name == "SKILL.md":
            skill_count += 1
    return {
        "root": relative_or_home(root),
        "present": True,
        "children": child_names(root),
        "manifests": sorted(manifests),
        "bundles": sorted(bundles, key=lambda item: item["root"]),
        "skill_count": skill_count,
    }


def compact(items: list[Any]) -> list[Any]:
    return [item for item in items if item is not None]


def build_report() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "repo": relative_or_home(ROOT),
        "cli": cli_inventory(),
        "claude": {
            "guides": [
                relative_or_home(path)
                for path in (HOME / ".claude/CLAUDE.md", ROOT / "CLAUDE.md")
                if path.is_file()
            ],
            "skills": compact(
                skills_under(path)
                for path in (ROOT / ".claude/skills", HOME / ".claude/skills")
            ),
            "commands": compact(
                markdown_commands(path)
                for path in (ROOT / ".claude/commands", HOME / ".claude/commands")
            ),
            "agents": compact(
                markdown_commands(path)
                for path in (ROOT / ".claude/agents", HOME / ".claude/agents")
            ),
            "plugins": plugin_inventory(HOME / ".claude/plugins"),
            "configs": compact(
                [
                    json_summary(ROOT / ".claude/settings.json"),
                    json_summary(ROOT / ".claude/settings.local.json"),
                    json_summary(HOME / ".claude/settings.json"),
                    json_summary(HOME / ".claude.json"),
                    json_summary(ROOT / ".mcp.json"),
                ]
            ),
        },
        "codex": {
            "guides": [
                relative_or_home(path)
                for path in (HOME / ".codex/AGENTS.md", ROOT / "AGENTS.md")
                if path.is_file()
            ],
            "skills": compact(
                skills_under(path)
                for path in (ROOT / ".agents/skills", HOME / ".agents/skills", HOME / ".codex/skills")
            ),
            "plugins": plugin_inventory(HOME / ".codex/plugins"),
            "agents": compact(
                [
                    sorted(relative_or_home(path) for path in (ROOT / ".codex/agents").glob("*.toml")),
                    sorted(relative_or_home(path) for path in (HOME / ".codex/agents").glob("*.toml")),
                ]
            ),
            "configs": compact(
                [
                    json_summary(ROOT / ".codex/hooks.json"),
                    toml_summary(ROOT / ".codex/config.toml"),
                    toml_summary(HOME / ".codex/config.toml"),
                ]
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote sanitized tooling report: {relative_or_home(args.output)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
