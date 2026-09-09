#!/usr/bin/env python3
"""Validate repository-native pstack skills, resources, and model pins."""

import argparse
import json
import re
import sys
from pathlib import Path

if sys.version_info < (3, 11):
    sys.exit("ERROR: Python 3.11 or later is required (docs/contributing/pstack-setup.md).")

import tomllib

ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads(path.read_text())


def check():
    source = read_json(ROOT / "docs/contributing/pstack-source.json")
    expected = set(source["skills"] + source["bundled_team_kit"])
    problems = []
    for edition in ("cursor", "codex"):
        harness = ROOT / (".cursor" if edition == "cursor" else ".agents")
        actual = {p.parent.name for p in (harness / "skills").glob("*/SKILL.md")}
        if not expected <= actual:
            problems.append(f"{edition}: missing skills: {sorted(expected - actual)}")
        for name in sorted(expected & actual):
            skill = harness / "skills" / name / "SKILL.md"
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
        roles = read_json(harness / "MODELS.json")["roles"]
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
        for p in (p for name in expected for p in (harness / "skills" / name).rglob("*.md")):
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
            if not (harness / relative).is_file():
                problems.append(f"{edition}: missing {relative}")
    for name, expected_pin in source["existing_codex_pins"].items():
        agent = tomllib.loads((ROOT / ".codex/agents" / name).read_text())
        if any(agent.get(k) != v for k, v in expected_pin.items()):
            problems.append(f"existing Codex pin changed: {name}")
    for name, expected_pin in source["existing_cursor_pins"].items():
        agent = ROOT / ".cursor/agents" / name
        match = re.search(r"^model: (.+)$", agent.read_text(), re.M)
        if not match or match[1] != expected_pin:
            problems.append(f"existing Cursor pin changed: {name}")
    if problems:
        raise RuntimeError("\n".join(problems))
    print(f"PASS: {len(source['skills'])} pstack skills + {len(source['bundled_team_kit'])} dependencies per harness; native manual policies; native pins; GitHub routing.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check",), default="check", nargs="?")
    parser.parse_args()
    check()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
