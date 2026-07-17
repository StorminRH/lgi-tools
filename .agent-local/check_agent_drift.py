#!/usr/bin/env python3
"""Validate parity between LGI.tools shared agent policy and runtime adapters."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = Path(__file__).with_name("policy-manifest.json")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_text(path: Path, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f"missing file: {relative(path)}")
        return ""
    return path.read_text(encoding="utf-8")


def parse_skill(path: Path, errors: list[str]) -> tuple[str, str]:
    text = read_text(path, errors)
    if not text:
        return "", ""
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        errors.append(f"{relative(path)}: missing opening YAML frontmatter")
        return "", text
    try:
        closing = lines.index("---", 1)
    except ValueError:
        errors.append(f"{relative(path)}: missing closing YAML frontmatter")
        return "", text

    frontmatter = lines[1:closing]
    keys = [
        match.group(1)
        for line in frontmatter
        if (match := re.match(r"^([A-Za-z][A-Za-z0-9_-]*):", line))
    ]
    if sorted(keys) != ["description", "name"]:
        errors.append(
            f"{relative(path)}: frontmatter keys must be exactly name + description"
        )

    name_line = next((line for line in frontmatter if line.startswith("name:")), "")
    name = name_line.partition(":")[2].strip()
    if not name:
        errors.append(f"{relative(path)}: empty skill name")
    if not any(line.startswith("description:") for line in frontmatter):
        errors.append(f"{relative(path)}: missing description")
    return name, "\n".join(lines[closing + 1 :])


def matches(text: str, pattern: str) -> bool:
    return re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL) is not None


def check_imports(manifest: dict, errors: list[str]) -> None:
    for raw_path, expected in manifest["imports"].items():
        path = ROOT / raw_path
        text = read_text(path, errors)
        first = next(
            (line.strip() for line in text.splitlines() if line.strip()), ""
        )
        if first != expected:
            errors.append(
                f"{raw_path}: first content line must be {expected!r}, got {first!r}"
            )


def hook_commands(value: object) -> list[str]:
    if isinstance(value, dict):
        commands: list[str] = []
        for key, nested in value.items():
            if key == "command" and isinstance(nested, str):
                commands.append(nested)
            else:
                commands.extend(hook_commands(nested))
        return commands
    if isinstance(value, list):
        commands = []
        for nested in value:
            commands.extend(hook_commands(nested))
        return commands
    return []


def check_hooks(manifest: dict, errors: list[str]) -> None:
    for raw_path, expected in manifest["hookConfigs"].items():
        path = ROOT / raw_path
        text = read_text(path, errors)
        if not text:
            continue
        try:
            config = json.loads(text)
        except json.JSONDecodeError as exc:
            errors.append(f"{raw_path}: invalid JSON: {exc}")
            continue
        actual = hook_commands(config.get("hooks", {}))
        if actual != expected:
            errors.append(
                f"{raw_path}: hook commands must be {expected!r}, got {actual!r}"
            )


def check_skill_pairs(manifest: dict, errors: list[str]) -> None:
    revision = str(manifest["policyRevision"])
    roots = {name: ROOT / value for name, value in manifest["skillRoots"].items()}
    expected_names = set(manifest["pairedSkills"])

    for runtime, root in roots.items():
        actual_names = {
            path.parent.name for path in root.glob("*/SKILL.md") if path.is_file()
        }
        if actual_names != expected_names:
            errors.append(
                f"{runtime} skill set mismatch: expected {sorted(expected_names)}, "
                f"found {sorted(actual_names)}"
            )

        for skill_name, policy in manifest["pairedSkills"].items():
            path = root / skill_name / "SKILL.md"
            parsed_name, body = parse_skill(path, errors)
            if parsed_name and parsed_name != skill_name:
                errors.append(
                    f"{relative(path)}: frontmatter name {parsed_name!r} does not "
                    f"match folder {skill_name!r}"
                )

            marker = f"<!-- shared-policy-revision: {revision} -->"
            if marker not in body:
                errors.append(f"{relative(path)}: missing marker {marker}")

            for pattern in policy["required"]:
                if not matches(body, pattern):
                    errors.append(
                        f"{relative(path)}: missing required policy /{pattern}/"
                    )
            for pattern in policy["forbidden"]:
                if matches(body, pattern):
                    errors.append(
                        f"{relative(path)}: contains stale policy /{pattern}/"
                    )
            for pattern in manifest["runtimeForbidden"].get(runtime, []):
                if matches(body, pattern):
                    errors.append(
                        f"{relative(path)}: contains wrong-runtime language /{pattern}/"
                    )


def check_paths(manifest: dict, errors: list[str]) -> None:
    for raw_path in [*manifest["canonicalGuides"], *manifest["requiredPaths"]]:
        path = ROOT / raw_path
        if not path.is_file():
            errors.append(f"missing required path: {raw_path}")
    for raw_path in manifest["forbiddenPaths"]:
        if (ROOT / raw_path).exists():
            errors.append(f"retired path still exists: {raw_path}")


def check_ignored(manifest: dict, errors: list[str]) -> None:
    for raw_path in manifest["ignoredPaths"]:
        result = subprocess.run(
            ["git", "check-ignore", "--quiet", "--", raw_path],
            cwd=ROOT,
            check=False,
        )
        if result.returncode != 0:
            errors.append(f"local agent path is not ignored: {raw_path}")


def check_session_contracts(manifest: dict, errors: list[str]) -> None:
    policy = manifest.get("sessionContracts", {})
    expected = policy.get("expected", [])
    scan_paths = [*policy.get("scan", []), *expected]

    for raw_path in expected:
        path = ROOT / raw_path
        if not path.is_file():
            errors.append(f"missing session contract: {raw_path}")
            continue
        text = read_text(path, errors)
        session_id = path.stem
        first = next((line for line in text.splitlines() if line.strip()), "")
        if not first.startswith(f"## Session {session_id} "):
            errors.append(
                f"{raw_path}: first heading must identify Session {session_id}"
            )
        if re.search(r"^# Phase ", text, flags=re.MULTILINE):
            errors.append(f"{raw_path}: contains a stray phase heading from the archive")

    for raw_path in scan_paths:
        text = read_text(ROOT / raw_path, errors)
        for pattern in policy.get("forbidden", []):
            if matches(text, pattern):
                errors.append(
                    f"{raw_path}: contains stale session-contract policy /{pattern}/"
                )


def check_development_state(manifest: dict, errors: list[str]) -> None:
    policy = manifest.get("developmentState", {})
    unknown_handlers = set(policy.get("allowedHandlers", [])) - set(manifest.get("pairedSkills", {}))
    if unknown_handlers:
        errors.append(
            "developmentState.allowedHandlers contains unregistered skills: "
            f"{sorted(unknown_handlers)!r}"
        )
    raw_path = policy.get("resolver")
    if not raw_path:
        errors.append("developmentState.resolver is not configured")
        return

    result = subprocess.run(
        [sys.executable, str(ROOT / raw_path)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stdout.strip() or result.stderr.strip() or "unknown failure"
        errors.append(f"development lifecycle state is invalid:\n{detail}")
        return

    try:
        state = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        errors.append(f"development state resolver returned invalid JSON: {exc}")
        return

    stage = state.get("stage")
    if stage not in policy.get("allowedStages", []):
        errors.append(f"development state resolver returned unknown stage: {stage!r}")

    directive = state.get("directive")
    if not isinstance(directive, dict):
        errors.append("development state resolver returned no directive object")
    else:
        expected_fields = set(policy.get("directiveFields", []))
        if set(directive) != expected_fields:
            errors.append(
                "development state directive fields must be "
                f"{sorted(expected_fields)!r}, got {sorted(directive)!r}"
            )
        handler = directive.get("handler")
        if handler is not None and handler not in policy.get("allowedHandlers", []):
            errors.append(f"development state resolver returned unknown handler: {handler!r}")
        mode = directive.get("mode")
        if mode not in policy.get("allowedModes", []):
            errors.append(f"development state resolver returned unknown mode: {mode!r}")
        for field in ("action", "reason", "authority", "pause"):
            if not isinstance(directive.get(field), str) or not directive[field].strip():
                errors.append(f"development state directive requires non-empty {field}")
        primary = directive.get("primaryArtifact")
        if primary is not None and not isinstance(primary, str):
            errors.append("development state directive primaryArtifact must be a string or null")
    for detail in state.get("errors", []):
        errors.append(f"development lifecycle state error: {detail}")


def check_development_state_tests(errors: list[str]) -> None:
    for path in sorted((ROOT / ".agent-local").glob("test_*.py")):
        result = subprocess.run(
            [sys.executable, str(path)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stdout.strip() or result.stderr.strip() or "unknown failure"
            errors.append(f"{relative(path)} fixture tests failed:\n{detail}")


def check_lifecycle_checkers(errors: list[str]) -> list[str]:
    """Run the cross-artifact checkers and return their non-blocking warnings."""
    warnings: list[str] = []
    for raw_path in (
        ".agent-local/check_env_example.py",
        ".agent-local/check_doc_refs.py",
        ".agent-local/check_lifecycle_evidence.py",
        ".agent-local/check_release_consistency.py",
    ):
        result = subprocess.run(
            [sys.executable, str(ROOT / raw_path)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stdout.strip() or result.stderr.strip() or "unknown failure"
            errors.append(f"{raw_path} failed to run:\n{detail}")
            continue
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            errors.append(f"{raw_path} returned invalid JSON: {exc}")
            continue
        checker_errors = payload.get("errors")
        checker_warnings = payload.get("warnings")
        if not isinstance(checker_errors, list) or not all(
            isinstance(item, str) for item in checker_errors
        ):
            errors.append(f"{raw_path} returned an invalid errors array")
            continue
        if not isinstance(checker_warnings, list) or not all(
            isinstance(item, str) for item in checker_warnings
        ):
            errors.append(f"{raw_path} returned an invalid warnings array")
            continue
        errors.extend(checker_errors)
        warnings.extend(checker_warnings)
    return warnings


def check_tooling(errors: list[str]) -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / ".agent-local/check_tooling_parity.py")],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stdout.strip() or result.stderr.strip() or "unknown failure"
        errors.append(f"tooling parity check failed:\n{detail}")


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []
    check_paths(manifest, errors)
    check_imports(manifest, errors)
    check_hooks(manifest, errors)
    check_skill_pairs(manifest, errors)
    check_ignored(manifest, errors)
    check_session_contracts(manifest, errors)
    check_development_state_tests(errors)
    warnings = check_lifecycle_checkers(errors)
    check_development_state(manifest, errors)
    check_tooling(errors)

    for warning in warnings:
        print(f"warn: {warning}")

    if errors:
        print(f"agent drift check failed ({len(errors)} finding(s)):")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "agent drift check passed: "
        f"policy revision {manifest['policyRevision']}, "
        f"{len(manifest['pairedSkills'])} paired skills"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
