#!/usr/bin/env python3
"""Validate repository-owned agent policy without inspecting the host harness."""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from tools._lib.repository import ROOT

MANIFEST_PATH = Path(__file__).with_name("policy-manifest.json")

LIFECYCLE_CHECKERS = (
    "tools/quality/check_baseline_claims.py",
    "tools/quality/check_env_example.py",
    "tools/policy/check_doc_refs.py",
    "tools/lifecycle/check_lifecycle_evidence.py",
    "tools/lifecycle/check_release_consistency.py",
    "tools/lifecycle/check_pending_changelog.py",
    "tools/update_watch/check_update_watch_baseline.py",
)


def relative(path: Path, root: Path) -> str:
    """Return a stable repository-relative path."""

    return path.relative_to(root).as_posix()


def matches(text: str, pattern: str) -> bool:
    """Return whether *pattern* appears in *text*, ignoring case."""

    return re.search(pattern, text, flags=re.IGNORECASE) is not None


def check_paths(manifest: dict[str, object], root: Path, errors: list[str]) -> None:
    """Check repository-owned required and forbidden paths."""

    for raw_path in manifest.get("requiredPaths", []):
        if not (root / str(raw_path)).exists():
            errors.append(f"missing required path: {raw_path}")
    for raw_path in manifest.get("forbiddenPaths", []):
        if (root / str(raw_path)).exists():
            errors.append(f"forbidden path exists: {raw_path}")


def check_canonical_guides(
    manifest: dict[str, object], root: Path, errors: list[str]
) -> None:
    """Require every canonical owner and exact import-only harness guide."""

    for raw_path in manifest.get("canonicalGuides", []):
        if not (root / str(raw_path)).is_file():
            errors.append(f"missing canonical guide: {raw_path}")

    imports = manifest.get("harnessGuideImports", {})
    if not isinstance(imports, dict):
        errors.append("harnessGuideImports must be an object")
        return
    for raw_path, expected in imports.items():
        path = root / str(raw_path)
        if not path.is_file():
            errors.append(f"missing harness guide: {raw_path}")
            continue
        actual = path.read_text(encoding="utf-8").strip()
        if actual != expected:
            errors.append(
                f"{raw_path}: must contain only the canonical import {expected!r}"
            )


def check_global_skill_contracts(
    manifest: dict[str, object], root: Path, errors: list[str]
) -> None:
    """Ensure each globally supplied skill has one repository procedure owner."""

    capability_path = root / "docs/AGENT_CAPABILITIES.md"
    capability_text = (
        capability_path.read_text(encoding="utf-8")
        if capability_path.is_file()
        else ""
    )
    skills = manifest.get("globalSkills", {})
    if not isinstance(skills, dict):
        errors.append("globalSkills must be an object")
        return
    documented_pairs = re.findall(
        r"^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$",
        capability_text,
        flags=re.MULTILINE,
    )
    documented = dict(documented_pairs)
    if len(documented) != len(documented_pairs):
        errors.append("docs/AGENT_CAPABILITIES.md: duplicate global skill mapping")
    for skill_name, procedure in sorted(skills.items()):
        procedure_path = root / str(procedure)
        if not procedure_path.is_file():
            errors.append(f"{skill_name}: missing owning procedure {procedure}")
        if documented.get(str(skill_name)) != str(procedure):
            errors.append(
                "docs/AGENT_CAPABILITIES.md: missing exact mapping "
                f"`{skill_name}` -> `{procedure}`"
            )
    unexpected = sorted(set(documented) - {str(name) for name in skills})
    if unexpected:
        errors.append(
            "docs/AGENT_CAPABILITIES.md: undocumented manifest skill(s): "
            + ", ".join(unexpected)
        )


def check_procedure_policies(
    manifest: dict[str, object], root: Path, errors: list[str]
) -> None:
    """Check ordered procedure invariants and forbidden runtime wording."""

    policies = manifest.get("procedurePolicies", {})
    if not isinstance(policies, dict):
        errors.append("procedurePolicies must be an object")
        return
    for raw_path, raw_policy in policies.items():
        path = root / str(raw_path)
        if not path.is_file():
            errors.append(f"missing procedure policy target: {raw_path}")
            continue
        text = path.read_text(encoding="utf-8")
        policy = raw_policy if isinstance(raw_policy, dict) else {}
        position = -1
        for pattern in policy.get("orderedRequired", []):
            match = re.search(str(pattern), text[position + 1 :], flags=re.IGNORECASE)
            if match is None:
                errors.append(f"{raw_path}: missing ordered policy `{pattern}`")
                continue
            position += match.end()
        for pattern in policy.get("forbidden", []):
            if matches(text, str(pattern)):
                errors.append(f"{raw_path}: forbidden runtime wording `{pattern}`")


def check_legacy_entrypoints(
    manifest: dict[str, object], root: Path, errors: list[str]
) -> None:
    """Ensure frozen-artifact entrypoints remain thin visible-tool shims."""

    entrypoints = manifest.get("legacyEntrypoints", {})
    if not isinstance(entrypoints, dict):
        errors.append("legacyEntrypoints must be an object")
        return
    for raw_path, command in entrypoints.items():
        path = root / str(raw_path)
        if not path.is_file():
            errors.append(f"missing legacy entrypoint: {raw_path}")
            continue
        text = path.read_text(encoding="utf-8")
        if len(text.splitlines()) > 35:
            errors.append(f"{raw_path}: compatibility entrypoint is not thin")
        expected = [str(part) for part in command] if isinstance(command, list) else []
        try:
            tree = ast.parse(text)
        except SyntaxError as exc:
            errors.append(f"{raw_path}: invalid Python: {exc}")
            continue
        calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "subprocess"
            and node.func.attr == "call"
        ]
        if len(calls) != 1 or not calls[0].args or not isinstance(calls[0].args[0], ast.List):
            errors.append(f"{raw_path}: must contain exactly one subprocess.call list")
            continue
        dispatch = calls[0].args[0].elts
        has_python = (
            len(dispatch) >= 2
            and isinstance(dispatch[0], ast.Attribute)
            and isinstance(dispatch[0].value, ast.Name)
            and dispatch[0].value.id == "sys"
            and dispatch[0].attr == "executable"
        )
        cli_path = dispatch[1] if len(dispatch) >= 2 else None
        has_cli_path = (
            isinstance(cli_path, ast.Call)
            and isinstance(cli_path.func, ast.Name)
            and cli_path.func.id == "str"
            and len(cli_path.args) == 1
            and isinstance(cli_path.args[0], ast.BinOp)
            and isinstance(cli_path.args[0].left, ast.Name)
            and cli_path.args[0].left.id == "ROOT"
            and isinstance(cli_path.args[0].op, ast.Div)
            and isinstance(cli_path.args[0].right, ast.Constant)
            and cli_path.args[0].right.value == "tools/cli.py"
        )
        literal_arguments = [
            node.value for node in dispatch[2:] if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
        ]
        has_forwarded_argv = any(isinstance(node, ast.Starred) for node in dispatch)
        cwd_is_root = any(
            keyword.arg == "cwd"
            and isinstance(keyword.value, ast.Name)
            and keyword.value.id == "ROOT"
            for keyword in calls[0].keywords
        )
        if (
            not has_python
            or not has_cli_path
            or literal_arguments != expected
            or not has_forwarded_argv
            or not cwd_is_root
        ):
            errors.append(
                f"{raw_path}: must dispatch exact argv {expected!r} through tools/cli.py"
            )


def _hook_commands(value: object) -> list[str]:
    """Return every command string from a nested hook configuration."""

    if isinstance(value, dict):
        commands: list[str] = []
        for key, nested in value.items():
            if key == "command" and isinstance(nested, str):
                commands.append(nested)
            else:
                commands.extend(_hook_commands(nested))
        return commands
    if isinstance(value, list):
        commands = []
        for nested in value:
            commands.extend(_hook_commands(nested))
        return commands
    return []


def check_hooks(manifest: dict[str, object], root: Path, errors: list[str]) -> None:
    """Require each tracked harness hook to use the exact root-safe commands."""

    hook_commands = manifest.get("hookCommands", {})
    if not isinstance(hook_commands, dict):
        errors.append("hookCommands must be an object")
        return
    for raw_path, expected in hook_commands.items():
        path = root / str(raw_path)
        if not path.is_file():
            errors.append(f"missing hook configuration: {raw_path}")
            continue
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{raw_path}: invalid JSON: {exc}")
            continue
        actual = _hook_commands(config.get("hooks", {}))
        if actual != expected:
            errors.append(
                f"{raw_path}: hook commands must be {expected!r}, got {actual!r}"
            )


def check_ignored(manifest: dict[str, object], errors: list[str]) -> None:
    """Ensure machine-local paths remain ignored by Git."""

    result = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        cwd=ROOT,
        input="\n".join(str(path) for path in manifest.get("ignoredPaths", [])) + "\n",
        text=True,
        capture_output=True,
        check=False,
    )
    ignored = set(result.stdout.splitlines())
    for raw_path in manifest.get("ignoredPaths", []):
        if str(raw_path) not in ignored:
            errors.append(f"machine-local path is not ignored: {raw_path}")


def check_probe_layout(manifest: dict[str, object], root: Path) -> list[str]:
    """Warn about session-only probe scripts outside the durable definitions."""

    policy = manifest.get("probeLayout", {})
    if not isinstance(policy, dict):
        return []
    definitions_dir = root / str(policy.get("definitionsDir", ""))
    stray_pattern = policy.get("strayPattern")
    if not isinstance(stray_pattern, str) or not stray_pattern:
        return []

    captures_dir = root / "docs/ux-check/captures"
    pruned = {".git", "node_modules", ".next", ".codegraph"}
    warnings: list[str] = []
    for current, directories, files in os.walk(root):
        current_path = Path(current)
        directories[:] = sorted(
            directory
            for directory in directories
            if directory not in pruned and current_path / directory != captures_dir
        )
        for filename in sorted(files):
            if not Path(filename).match(stray_pattern):
                continue
            path = current_path / filename
            try:
                path.relative_to(definitions_dir)
            except ValueError:
                warnings.append(
                    "stray probe script (scratch allowed; delete at close-out): "
                    f"{relative(path, root)}"
                )
    return warnings


def check_lifecycle_checkers(
    errors: list[str],
    *,
    root: Path = ROOT,
    checkers: tuple[str, ...] = LIFECYCLE_CHECKERS,
) -> list[str]:
    """Run cross-artifact checkers when a lifecycle workflow explicitly asks."""

    warnings: list[str] = []
    for raw_path in checkers:
        result = subprocess.run(
            [sys.executable, str(root / raw_path), "--root", str(root)],
            cwd=root,
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


def main() -> int:
    """Run the ordinary-safe repository policy checks."""

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []
    check_paths(manifest, ROOT, errors)
    check_canonical_guides(manifest, ROOT, errors)
    check_global_skill_contracts(manifest, ROOT, errors)
    check_procedure_policies(manifest, ROOT, errors)
    check_legacy_entrypoints(manifest, ROOT, errors)
    check_hooks(manifest, ROOT, errors)
    check_ignored(manifest, errors)
    warnings = check_probe_layout(manifest, ROOT)

    for warning in warnings:
        print(f"warn: {warning}")
    if errors:
        print(f"agent policy check failed ({len(errors)} finding(s)):")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "agent policy check passed: repository policy is internally consistent; "
        "host capabilities were not inspected"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
