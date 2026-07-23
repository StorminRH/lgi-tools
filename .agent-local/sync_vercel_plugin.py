#!/usr/bin/env python3
"""Build the Codex Vercel adapter from Claude's installed Vercel plugin.

Outputs:
- a personal Codex plugin containing normalized Vercel skills and five
  command-equivalent skills;
- three project-scoped Codex custom-agent TOML files;
- a source stamp used by the parity audit.

Run with `--write` to synchronize or `--check` to verify parity. The script
never modifies the Claude plugin source or its marketplace metadata.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parent.parent
HOME = Path.home()
DEFAULT_SOURCE = HOME / ".claude/plugins/marketplaces/vercel"
DEFAULT_TARGET = HOME / "plugins/vercel-plugin"
DEFAULT_AGENTS_TARGET = HOME / ".codex/agents"
MARKER = ".generated-by-lgi-agent-parity"
COMMAND_NAMES = ("bootstrap", "deploy", "env", "marketplace", "status")
SAFETY = """Follow the active AGENTS.md instruction chain; it overrides this
Vercel reference when project policy differs. Verify version-sensitive Vercel,
Next.js, and library behavior from current primary documentation. This adapter
does not authorize deployment, promotion, rollback, production environment or
domain changes, cache purges, merges, or other externally consequential writes:
obtain the operator's explicit approval at the point of action. LGI.tools keeps
Greptile as its PR review gate of record; Vercel review guidance is supplementary.
"""


@dataclass(frozen=True)
class SourceInfo:
    version: str
    sha: str


def read_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"missing YAML frontmatter: {path}")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError(f"unterminated YAML frontmatter: {path}")
    metadata = yaml.safe_load(text[4:end]) or {}
    if not isinstance(metadata, dict):
        raise ValueError(f"frontmatter is not an object: {path}")
    return metadata, text[end + 5 :].lstrip("\n")


def normalized_skill(name: str, description: str, body: str) -> str:
    adapter = (
        "\n> **Codex adapter safety:** "
        + " ".join(SAFETY.splitlines())
        + "\n\n"
    )
    return (
        "---\n"
        f"name: {json.dumps(name, ensure_ascii=False)}\n"
        f"description: {json.dumps(description.strip(), ensure_ascii=False)}\n"
        "---\n"
        + adapter
        + body.rstrip()
        + "\n"
    )


def source_info(source: Path) -> SourceInfo:
    manifest = json.loads((source / ".plugin/plugin.json").read_text(encoding="utf-8"))
    result = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        text=True,
        capture_output=True,
        check=True,
    )
    return SourceInfo(version=str(manifest["version"]), sha=result.stdout.strip())


def copy_skill(source_dir: Path, target_dir: Path) -> None:
    metadata, body = read_frontmatter(source_dir / "SKILL.md")
    name = str(metadata.get("name") or source_dir.name)
    description = str(metadata.get("description") or f"Vercel guidance for {name}.")
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "SKILL.md").write_text(
        normalized_skill(name, description, body), encoding="utf-8"
    )
    for child in source_dir.iterdir():
        if child.name in {"SKILL.md", "upstream", "overlay.yaml"}:
            continue
        destination = target_dir / child.name
        if child.is_dir():
            shutil.copytree(child, destination)
        elif child.is_file():
            shutil.copy2(child, destination)


def command_skill(source: Path, target: Path) -> None:
    metadata, body = read_frontmatter(source)
    command = source.stem
    description = str(metadata.get("description") or f"Run the Vercel {command} workflow.")
    body = body.replace(
        "$ARGUMENTS", "the arguments in the operator's request"
    )
    for source_name in COMMAND_NAMES:
        body = body.replace(f"`/{source_name}`", f"`$vercel-{source_name}`")
    target.mkdir(parents=True, exist_ok=True)
    (target / "SKILL.md").write_text(
        normalized_skill(f"vercel-{command}", description, body), encoding="utf-8"
    )


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def custom_agent(source: Path, target: Path) -> None:
    metadata, body = read_frontmatter(source)
    name = str(metadata.get("name") or source.stem)
    description = str(metadata.get("description") or f"Vercel specialist: {name}")
    instructions = SAFETY + "\n\n" + body.rstrip() + "\n"
    content = (
        f"name = {toml_string(name)}\n"
        f"description = {toml_string(description)}\n"
        f"developer_instructions = {toml_string(instructions)}\n"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def update_manifest(target: Path, info: SourceInfo) -> None:
    manifest_path = target / ".codex-plugin/plugin.json"
    if not manifest_path.is_file():
        raise ValueError(
            f"missing scaffold manifest at {manifest_path}; run plugin-creator first"
        )
    version = f"{info.version}+codex.{info.sha[:12]}"
    manifest = {
        "name": "vercel-plugin",
        "version": version,
        "description": "Vercel ecosystem skills and workflows adapted for Codex.",
        "author": {"name": "Vercel", "url": "https://github.com/vercel"},
        "homepage": "https://github.com/vercel/vercel-plugin",
        "repository": "https://github.com/vercel/vercel-plugin",
        "license": "Apache-2.0",
        "keywords": ["vercel", "nextjs", "deployment", "ai-sdk", "workflow"],
        "skills": "./skills/",
        "interface": {
            "displayName": "Vercel Plugin",
            "shortDescription": "Vercel and Next.js expertise for Codex.",
            "longDescription": (
                "Vercel's skills, operational workflows, and specialist guidance "
                "adapted to Codex while preserving LGI.tools safety gates."
            ),
            "developerName": "Vercel / local Codex adapter",
            "category": "Developer Tools",
            "capabilities": ["Skills", "Custom agents", "CLI workflows"],
            "defaultPrompt": [
                "Check this Vercel project's status.",
                "Review this Next.js change against current Vercel guidance.",
                "Plan a safe Vercel deployment without deploying yet.",
            ],
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def sync(source: Path, target: Path, agents_target: Path) -> SourceInfo:
    info = source_info(source)
    if not (source / "skills").is_dir():
        raise ValueError(f"missing Vercel skills directory: {source / 'skills'}")
    if not (target / ".codex-plugin/plugin.json").is_file():
        raise ValueError(f"target is not a scaffolded Codex plugin: {target}")

    skills_target = target / "skills"
    if skills_target.exists():
        shutil.rmtree(skills_target)
    skills_target.mkdir(parents=True)

    source_skills = 0
    for skill_dir in sorted((source / "skills").iterdir()):
        if skill_dir.is_dir() and (skill_dir / "SKILL.md").is_file():
            copy_skill(skill_dir, skills_target / skill_dir.name)
            source_skills += 1

    for command in COMMAND_NAMES:
        command_skill(
            source / "commands" / f"{command}.md",
            skills_target / f"vercel-{command}",
        )

    for agent_path in sorted((source / "agents").glob("*.md")):
        custom_agent(agent_path, agents_target / f"{agent_path.stem}.toml")

    update_manifest(target, info)
    stamp = {
        "source": str(source),
        "source_version": info.version,
        "source_sha": info.sha,
        "source_skills": source_skills,
        "command_adapters": len(COMMAND_NAMES),
        "custom_agents": len(list((source / "agents").glob("*.md"))),
    }
    (target / MARKER).write_text(json.dumps(stamp, indent=2) + "\n", encoding="utf-8")
    return info


def check(source: Path, target: Path, agents_target: Path) -> list[str]:
    errors: list[str] = []
    try:
        info = source_info(source)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        return [f"cannot read Vercel source: {exc}"]

    stamp_path = target / MARKER
    if not stamp_path.is_file():
        errors.append(f"missing sync stamp: {stamp_path}")
        return errors
    stamp = json.loads(stamp_path.read_text(encoding="utf-8"))
    if stamp.get("source_version") != info.version or stamp.get("source_sha") != info.sha:
        errors.append("Codex Vercel adapter is not synced to Claude's source version/SHA")

    source_names = {
        path.name
        for path in (source / "skills").iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }
    target_names = {
        path.name
        for path in (target / "skills").iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }
    expected_names = source_names | {f"vercel-{name}" for name in COMMAND_NAMES}
    if target_names != expected_names:
        errors.append(
            "Vercel skill set mismatch: "
            f"expected {len(expected_names)}, found {len(target_names)}"
        )

    for skill_name in sorted(target_names):
        skill_path = target / "skills" / skill_name / "SKILL.md"
        try:
            metadata, body = read_frontmatter(skill_path)
        except (OSError, ValueError, yaml.YAMLError) as exc:
            errors.append(f"invalid generated skill {skill_name}: {exc}")
            continue
        if set(metadata) != {"name", "description"}:
            errors.append(f"generated skill {skill_name} frontmatter is not normalized")
        if "Codex adapter safety" not in body or "Greptile" not in body:
            errors.append(f"generated skill {skill_name} is missing adapter safety policy")
        if "$ARGUMENTS" in body:
            errors.append(f"generated skill {skill_name} contains Claude command arguments")

    for agent_path in (source / "agents").glob("*.md"):
        target_agent = agents_target / f"{agent_path.stem}.toml"
        if not target_agent.is_file():
            errors.append(f"missing Codex custom agent for {agent_path.stem}")
            continue
        values: dict[str, str] = {}
        try:
            for line in target_agent.read_text(encoding="utf-8").splitlines():
                key, separator, raw_value = line.partition(" = ")
                if separator:
                    values[key] = json.loads(raw_value)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"invalid Codex custom agent {agent_path.stem}: {exc}")
            continue
        metadata, source_body = read_frontmatter(agent_path)
        if values.get("name") != str(metadata.get("name") or agent_path.stem):
            errors.append(f"Codex custom agent name drift: {agent_path.stem}")
        instructions = values.get("developer_instructions", "")
        if source_body.rstrip() not in instructions or "Greptile" not in instructions:
            errors.append(f"Codex custom agent body/safety drift: {agent_path.stem}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--agents-target", type=Path, default=DEFAULT_AGENTS_TARGET)
    args = parser.parse_args()

    if args.write:
        info = sync(args.source.expanduser(), args.target.expanduser(), args.agents_target)
        print(
            "synced Vercel plugin to Codex: "
            f"version {info.version}, source {info.sha[:12]}"
        )
        return 0

    errors = check(args.source.expanduser(), args.target.expanduser(), args.agents_target)
    if errors:
        print(f"Vercel parity check failed ({len(errors)} finding(s)):")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Vercel parity check passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.SubprocessError, yaml.YAMLError) as exc:
        print(f"sync failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
