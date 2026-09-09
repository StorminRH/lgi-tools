#!/usr/bin/env python3
"""Check the repository adoption and install each native plugin explicitly."""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads(path.read_text())


def check():
    source = read_json(ROOT / "plugins/pstack-source.json")
    expected = set(source["skills"] + source["bundled_team_kit"])
    problems = []
    for edition in ("cursor", "codex"):
        plugin = ROOT / "plugins" / f"pstack-{edition}"
        manifest = read_json(plugin / f".{edition}-plugin/plugin.json")
        if manifest["name"] != plugin.name:
            problems.append(f"{edition}: plugin name does not match its directory")
        actual = {p.parent.name for p in (plugin / "skills").glob("*/SKILL.md")}
        if actual != expected:
            problems.append(f"{edition}: missing/extra skills: {sorted(actual ^ expected)}")
        for name in actual:
            skill = plugin / "skills" / name / "SKILL.md"
            match = re.match(r"^---\n(.*?)\n---\n", skill.read_text(), re.S)
            if not match:
                problems.append(f"{skill.relative_to(ROOT)}: missing frontmatter")
                continue
            fields = match[1]
            if not re.search(rf"^name: {re.escape(name)}$", fields, re.M):
                problems.append(f"{name}: frontmatter name differs from directory")
            if not re.search(r"^description: .+", fields, re.M):
                problems.append(f"{name}: missing description")
            if edition == "cursor":
                manual = "disable-model-invocation: true" in fields
            else:
                policy = skill.parent / "agents/openai.yaml"
                manual = policy.exists() and "allow_implicit_invocation: false" in policy.read_text()
            if not manual:
                problems.append(f"{edition}/{name}: missing manual-invocation policy")
            for directory in (".cursor/skills", ".agents/skills", ".codex/skills"):
                if (ROOT / directory / name).exists():
                    problems.append(f"duplicate discovery: {directory}/{name}")
        roles = read_json(plugin / "MODELS.json")["roles"]
        for name, choices in roles.items():
            for choice in choices if isinstance(choices, list) else [choices]:
                if edition == "codex":
                    agent_file = ROOT / ".codex/agents" / f"{choice['agent']}.toml"
                    agent = tomllib.loads(agent_file.read_text())
                    if (agent.get("model"), agent.get("model_reasoning_effort")) != (
                        choice["model"], choice["reasoning_effort"]
                    ):
                        problems.append(f"Codex {name}: role pin disagrees with MODELS.json")
                elif not isinstance(choice.get("model"), str) or not choice["model"].strip():
                    problems.append(f"Cursor {name}: model slug is empty")
        for p in (plugin / "skills").rglob("*.md"):
            if "`origin pr" in p.read_text() or "command -v origin" in p.read_text():
                problems.append(f"Origin CLI instruction remains: {p.relative_to(ROOT)}")
        for relative in (
            "LICENSE", "TEAM-KIT-LICENSE", "HARNESS.md", "LGI.md",
            "skills/poteto-mode/scripts/watch-pr/watch-pr",
            "skills/poteto-mode/scripts/orch/orch.ts",
            "skills/poteto-mode/scripts/bun.lock",
            "skills/poteto-mode/scripts/check-plan.mjs",
            "skills/show-me-your-work/scripts/log.sh",
        ):
            if not (plugin / relative).is_file():
                problems.append(f"{edition}: missing {relative}")
    for name, expected_pin in source["existing_codex_pins"].items():
        agent = tomllib.loads((ROOT / ".codex/agents" / name).read_text())
        if any(agent.get(k) != v for k, v in expected_pin.items()):
            problems.append(f"existing Codex pin changed: {name}")
    for name, expected_pin in source["existing_cursor_pins"].items():
        agent = ROOT / ".cursor/agents" / name
        if name == "comment-sicko.md":
            agent = ROOT / "plugins/pstack-cursor/agents" / name
        match = re.search(r"^model: (.+)$", agent.read_text(), re.M)
        if not match or match[1] != expected_pin:
            problems.append(f"existing Cursor pin changed: {name}")
    if problems:
        raise RuntimeError("\n".join(problems))
    print(f"PASS: {len(source['skills'])} pstack skills + 3 dependencies per edition; manual discovery; native pins; GitHub routing.")


def install_cursor():
    source = ROOT / "plugins/pstack-cursor"
    target = Path.home() / ".cursor/plugins/local/pstack-cursor"
    if target.is_symlink() and target.resolve() == source:
        print(f"Already linked: {target}")
        return
    if target.exists() or target.is_symlink():
        raise RuntimeError(f"Refusing to overwrite {target}; inspect the existing installation first.")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.symlink_to(source, target_is_directory=True)
    print(f"Linked {target} to {source}")
    print("Reload Cursor, enable this local plugin, and open a new chat in this checkout.")


def install_codex():
    codex = shutil.which("codex")
    if not codex:
        raise RuntimeError("Codex CLI is not installed or not on PATH. Use the setup guide before installing this plugin.")
    marketplace = read_json(ROOT / ".agents/plugins/marketplace.json")
    print("Registering the explicit repository marketplace. Existing marketplace conflicts must be resolved in Codex, not overwritten.", flush=True)
    subprocess.run([codex, "plugin", "marketplace", "add", str(ROOT)], check=True)
    subprocess.run([codex, "plugin", "add", f"pstack-codex@{marketplace['name']}"], check=True)
    print("Open a new Codex thread in this trusted checkout. Run the live discovery/model checks in the setup guide.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "install-cursor", "install-codex"), default="check", nargs="?")
    args = parser.parse_args()
    check()
    if args.action == "install-cursor":
        install_cursor()
    elif args.action == "install-codex":
        install_codex()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
