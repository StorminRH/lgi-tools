#!/usr/bin/env python3
"""Validate parity between LGI.tools shared agent policy and runtime adapters."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from resolve_development_state import (
    active_roadmap,
    contract_schema_violations,
    parse_contract_index,
    sha256,
)


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = Path(__file__).with_name("policy-manifest.json")


def relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def read_text(path: Path, root: Path, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f"missing file: {relative(path, root)}")
        return ""
    return path.read_text(encoding="utf-8")


def parse_skill(path: Path, root: Path, errors: list[str]) -> tuple[str, str]:
    text = read_text(path, root, errors)
    if not text:
        return "", ""
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        errors.append(f"{relative(path, root)}: missing opening YAML frontmatter")
        return "", text
    try:
        closing = lines.index("---", 1)
    except ValueError:
        errors.append(f"{relative(path, root)}: missing closing YAML frontmatter")
        return "", text

    frontmatter = lines[1:closing]
    keys = [
        match.group(1)
        for line in frontmatter
        if (match := re.match(r"^([A-Za-z][A-Za-z0-9_-]*):", line))
    ]
    if sorted(keys) != ["description", "name"]:
        errors.append(
            f"{relative(path, root)}: frontmatter keys must be exactly name + description"
        )

    name_line = next((line for line in frontmatter if line.startswith("name:")), "")
    name = name_line.partition(":")[2].strip()
    if not name:
        errors.append(f"{relative(path, root)}: empty skill name")
    if not any(line.startswith("description:") for line in frontmatter):
        errors.append(f"{relative(path, root)}: missing description")
    return name, "\n".join(lines[closing + 1 :])


def matches(text: str, pattern: str) -> bool:
    return re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL) is not None


def derived_session_contracts(root: Path) -> tuple[list[str], str | None]:
    """Return indexed session-contract paths together with the active version.

    The roadmap discovery and INDEX.md format stay owned by the lifecycle
    resolver; this derives the drift gate's expectations from them instead of
    a hand-synced manifest list. No active master plan or no index yields an
    empty list without error: those lifecycle states are the resolver's to
    report, and the empty set is exactly the legal post-archive boundary state
    the old hand-list had to be manually emptied into.
    """
    _, version, _, _ = active_roadmap(root)
    if version is None:
        return [], None
    index_path = root / "docs/session-contracts" / version / "INDEX.md"
    expected = sorted(
        path.relative_to(root).as_posix()
        for _, path in parse_contract_index(index_path).values()
    )
    return expected, version


def check_imports(manifest: dict, errors: list[str]) -> None:
    for raw_path, expected in manifest["imports"].items():
        path = ROOT / raw_path
        text = read_text(path, ROOT, errors)
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
        text = read_text(path, ROOT, errors)
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


def check_skill_pairs(manifest: dict, root: Path, errors: list[str]) -> None:
    roots = {name: root / value for name, value in manifest["skillRoots"].items()}
    expected_names = set(manifest["pairedSkills"])
    canonical = set(manifest["canonicalGuides"])

    for runtime, skill_root in roots.items():
        actual_names = {
            path.parent.name
            for path in skill_root.glob("*/SKILL.md")
            if path.is_file()
        }
        if actual_names != expected_names:
            errors.append(
                f"{runtime} skill set mismatch: expected {sorted(expected_names)}, "
                f"found {sorted(actual_names)}"
            )

        for skill_name, policy in manifest["pairedSkills"].items():
            path = skill_root / skill_name / "SKILL.md"
            parsed_name, body = parse_skill(path, root, errors)
            if parsed_name and parsed_name != skill_name:
                errors.append(
                    f"{relative(path, root)}: frontmatter name {parsed_name!r} does not "
                    f"match folder {skill_name!r}"
                )

            procedure = policy.get("procedure")
            if not isinstance(procedure, str) or procedure not in canonical:
                errors.append(
                    f"pairedSkills[{skill_name}].procedure must name one canonical guide"
                )
            elif body.count(procedure) != 1:
                errors.append(
                    f"{relative(path, root)}: must point to {procedure} exactly once"
                )

            for pattern in policy["required"]:
                if not matches(body, pattern):
                    errors.append(
                        f"{relative(path, root)}: missing required policy /{pattern}/"
                    )
            for pattern in policy["forbidden"]:
                if matches(body, pattern):
                    errors.append(
                        f"{relative(path, root)}: contains stale policy /{pattern}/"
                    )
            for pattern in manifest["runtimeForbidden"].get(runtime, []):
                if matches(body, pattern):
                    errors.append(
                        f"{relative(path, root)}: contains wrong-runtime language /{pattern}/"
                    )


def check_procedure_policies(manifest: dict, root: Path, errors: list[str]) -> None:
    """Require declared procedure checkpoints to occur in canonical order."""
    canonical = set(manifest["canonicalGuides"])
    for raw_path, policy in manifest.get("procedurePolicies", {}).items():
        if raw_path not in canonical:
            errors.append(f"procedurePolicies path is not canonical: {raw_path}")
            continue
        text = read_text(root / raw_path, root, errors)
        cursor = 0
        for pattern in policy.get("orderedRequired", []):
            match = re.search(pattern, text[cursor:], flags=re.IGNORECASE | re.DOTALL)
            if match is None:
                errors.append(
                    f"{raw_path}: missing or reordered procedure checkpoint /{pattern}/"
                )
                break
            cursor += match.end()


def _normalized_prose(value: str) -> str:
    """Return deterministic exact-match prose normalization."""
    value = re.sub(r"\[([^]]+)]\([^)]+\)", r"\1", value)
    value = value.replace("`", "")
    value = unicodedata.normalize("NFKC", value).casefold()
    value = "".join(character if character.isalnum() else " " for character in value)
    return " ".join(value.split())


def _prose_sentences(text: str) -> list[tuple[int, str]]:
    """Extract prose while ignoring frontmatter, headings, fences, and labels."""
    lines = text.splitlines()
    start = 0
    if lines and lines[0] == "---":
        try:
            start = lines.index("---", 1) + 1
        except ValueError:
            start = 0
    sentences: list[tuple[int, str]] = []
    paragraph: list[str] = []
    paragraph_line = 0
    fenced = False

    def flush() -> None:
        nonlocal paragraph, paragraph_line
        if not paragraph:
            return
        joined = " ".join(paragraph).strip()
        for sentence in re.split(r"(?<=[.!?])\s+", joined):
            if sentence.strip():
                sentences.append((paragraph_line, sentence.strip()))
        paragraph = []
        paragraph_line = 0

    for number, line in enumerate(lines[start:], start=start + 1):
        stripped = line.strip()
        if stripped.startswith("```"):
            flush()
            fenced = not fenced
            continue
        if fenced:
            continue
        if not stripped:
            flush()
            continue
        table_separator = re.fullmatch(
            r"\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?", stripped
        )
        if stripped.startswith("#") or table_separator:
            flush()
            continue
        list_match = re.match(r"^(?:[-*+] |\d+[.)] )(.*)$", stripped)
        if list_match:
            flush()
            paragraph_line = number
            paragraph = [list_match.group(1)]
            continue
        if paragraph_line == 0:
            paragraph_line = number
        paragraph.append(stripped)
    flush()
    return sentences


def check_prose_ownership(manifest: dict, root: Path, errors: list[str]) -> None:
    """Reject exact normalized normative sentences with more than one owner."""
    policy = manifest.get("proseOwnership", {})
    paths = policy.get("paths", [])
    minimum_words = policy.get("minimumWords", 12)
    if not isinstance(paths, list) or not all(isinstance(path, str) for path in paths):
        errors.append("proseOwnership.paths must be a string list")
        return
    if not isinstance(minimum_words, int) or minimum_words < 4:
        errors.append("proseOwnership.minimumWords must be an integer of at least 4")
        return

    occurrences: dict[str, list[tuple[str, int]]] = {}
    for raw_path in paths:
        text = read_text(root / raw_path, root, errors)
        for line, sentence in _prose_sentences(text):
            normalized = _normalized_prose(sentence)
            if len(normalized.split()) < minimum_words:
                continue
            occurrences.setdefault(normalized, []).append((raw_path, line))

    exceptions: dict[tuple[str, tuple[str, ...]], str] = {}
    for entry in policy.get("exceptions", []):
        if not isinstance(entry, dict):
            errors.append("proseOwnership exception must be an object")
            continue
        sentence = entry.get("sentence")
        exception_paths = entry.get("paths")
        reason = entry.get("reason")
        if (
            not isinstance(sentence, str)
            or not isinstance(exception_paths, list)
            or len(exception_paths) < 2
            or not all(isinstance(path, str) for path in exception_paths)
            or not isinstance(reason, str)
            or not reason.strip()
        ):
            errors.append(
                "proseOwnership exception requires sentence, at least two exact paths, and reason"
            )
            continue
        key = (_normalized_prose(sentence), tuple(sorted(set(exception_paths))))
        exceptions[key] = reason

    used: set[tuple[str, tuple[str, ...]]] = set()
    for normalized, raw_occurrences in sorted(occurrences.items()):
        unique = sorted(set(raw_occurrences))
        owned_paths = tuple(sorted({path for path, _ in unique}))
        if len(owned_paths) < 2:
            continue
        key = (normalized, owned_paths)
        if key in exceptions:
            used.add(key)
            continue
        locations = ", ".join(f"{path}:{line}" for path, line in unique)
        errors.append(f"duplicate normative prose [{normalized}]: {locations}")

    for key in sorted(set(exceptions) - used):
        errors.append(
            "unused proseOwnership exception: "
            f"[{key[0]}] for {', '.join(key[1])}"
        )


def ledger_digest(root: Path, deps: list[str]) -> str:
    """Return one digest over the current content of a skill's policy deps.

    Each dep contributes its own file sha256; the concatenation is hashed in the
    manifest-declared order, so a changed dep or a changed dep list both move the
    result. Missing deps are skipped here and reported by check_paths.
    """
    combined = "".join(sha256(root / dep) for dep in deps if (root / dep).is_file())
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def check_skill_reconciliation(manifest: dict, root: Path, errors: list[str]) -> None:
    """Verify each skill was reconciled against the current text of its policy deps.

    Replaces the old per-file revision marker. The ledger records, per skill, the
    canonical policy docs it derives from and a digest of their content at reconcile
    time. A changed dep moves the digest and flags exactly the skills that depend on
    it; `reconcile_skill_ledger.py` restamps them after a deliberate re-review.
    """
    ledger = manifest.get("skillReconciliation", {})
    canonical = set(manifest["canonicalGuides"])
    for skill_name in manifest["pairedSkills"]:
        entry = ledger.get(skill_name)
        if not isinstance(entry, dict):
            errors.append(f"skillReconciliation is missing an entry for {skill_name}")
            continue
        deps = entry.get("deps", [])
        if not isinstance(deps, list) or not deps:
            errors.append(
                f"skillReconciliation[{skill_name}] must list at least one policy dep"
            )
            continue
        for dep in deps:
            if dep not in canonical:
                errors.append(
                    f"skillReconciliation[{skill_name}] dep is not a canonical guide: {dep}"
                )
        if ledger_digest(root, deps) != entry.get("reconciledHash"):
            errors.append(
                f"{skill_name}: skill is stale against its policy deps; re-review it and "
                "run reconcile_skill_ledger.py to restamp reconciledHash"
            )


def check_paths(manifest: dict, root: Path, errors: list[str]) -> None:
    skill_paths = [
        f"{skill_root}/{skill_name}/SKILL.md"
        for skill_root in manifest["skillRoots"].values()
        for skill_name in manifest["pairedSkills"]
    ]
    for raw_path in [
        *manifest["canonicalGuides"],
        *manifest["requiredPaths"],
        *skill_paths,
    ]:
        path = root / raw_path
        if not path.is_file():
            errors.append(f"missing required path: {raw_path}")
    for raw_path in manifest["forbiddenPaths"]:
        if (root / raw_path).exists():
            errors.append(f"retired path still exists: {raw_path}")


def check_probe_layout(manifest: dict, root: Path) -> list[str]:
    """Flag stray *-probe.mjs scripts outside the probe-definitions layout.

    Warnings, not errors: scratch probes are allowed during a session and
    deleted at close-out.
    """
    policy = manifest.get("probeLayout", {})
    definitions_dir = root / policy.get("definitionsDir", "")
    stray_pattern = policy.get("strayPattern")
    if not stray_pattern:
        return []

    pruned = {".git", "node_modules", ".next", ".codegraph"}
    captures_dir = root / "docs/ux-check/captures"
    warnings: list[str] = []
    for current, directories, files in os.walk(root):
        current_path = Path(current)
        directories[:] = sorted(
            directory
            for directory in directories
            if directory not in pruned
            and current_path / directory != captures_dir
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


def check_ignored(manifest: dict, errors: list[str]) -> None:
    for raw_path in manifest["ignoredPaths"]:
        result = subprocess.run(
            ["git", "check-ignore", "--quiet", "--", raw_path],
            cwd=ROOT,
            check=False,
        )
        if result.returncode != 0:
            errors.append(f"local agent path is not ignored: {raw_path}")


def check_session_contracts(manifest: dict, root: Path, errors: list[str]) -> None:
    policy = manifest.get("sessionContracts", {})
    expected, version = derived_session_contracts(root)
    scan_paths = [*policy.get("scan", []), *expected]
    schema_path = policy.get("schema")
    legacy = set(manifest.get("developmentState", {}).get("legacySchemaArtifacts", []))

    if version is not None:
        contract_root = root / "docs/session-contracts" / version
        indexed = {root / raw_path for raw_path in expected}
        for path in sorted(contract_root.glob("*.md")):
            if path.name != "INDEX.md" and path not in indexed:
                errors.append(f"unindexed session contract: {relative(path, root)}")

    for raw_path in expected:
        path = root / raw_path
        if not path.is_file():
            errors.append(f"missing session contract: {raw_path}")
            continue
        text = read_text(path, root, errors)
        session_id = path.stem
        first = next((line for line in text.splitlines() if line.strip()), "")
        if not first.startswith(f"## Session {session_id} "):
            errors.append(
                f"{raw_path}: first heading must identify Session {session_id}"
            )
        if re.search(r"^# Phase ", text, flags=re.MULTILINE):
            errors.append(f"{raw_path}: contains a stray phase heading from the archive")
        if schema_path and raw_path not in legacy:
            for violation in contract_schema_violations(path, root):
                errors.append(f"{raw_path}: contract schema violation: {violation}")

    for raw_path in scan_paths:
        text = read_text(root / raw_path, root, errors)
        for pattern in policy.get("forbidden", []):
            if matches(text, pattern):
                errors.append(
                    f"{raw_path}: contains stale session-contract policy /{pattern}/"
                )


def check_development_state(manifest: dict, errors: list[str]) -> None:
    policy = manifest.get("developmentState", {})
    legacy = policy.get("legacySchemaArtifacts", [])
    if not isinstance(legacy, list):
        errors.append("developmentState.legacySchemaArtifacts must be a list")
    else:
        for raw_path in legacy:
            if (
                not isinstance(raw_path, str)
                or any(token in raw_path for token in ("*", "?", "["))
                or not raw_path.startswith(
                    ("docs/session-contracts/", "docs/session-plans/")
                )
            ):
                errors.append(
                    "developmentState legacy schema exemptions must be exact contract or plan paths: "
                    f"{raw_path!r}"
                )
            elif not (ROOT / raw_path).is_file():
                errors.append(f"developmentState legacy schema artifact is missing: {raw_path}")
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
        expected_gate = policy.get("preDispatchGate") if handler is not None else None
        if directive.get("preDispatchGate") != expected_gate:
            errors.append(
                "development state directive preDispatchGate must be "
                f"{expected_gate!r} when handler is {handler!r}"
            )
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
            errors.append(f"{relative(path, ROOT)} fixture tests failed:\n{detail}")


LIFECYCLE_CHECKERS = (
    ".agent-local/check_baseline_claims.py",
    ".agent-local/check_env_example.py",
    ".agent-local/check_doc_refs.py",
    ".agent-local/check_lifecycle_evidence.py",
    ".agent-local/check_release_consistency.py",
    ".agent-local/check_pending_changelog.py",
    ".agent-local/check_update_watch_baseline.py",
)


def check_lifecycle_checkers(
    errors: list[str],
    *,
    root: Path = ROOT,
    checkers: tuple[str, ...] = LIFECYCLE_CHECKERS,
) -> list[str]:
    """Run the cross-artifact checkers and return their non-blocking warnings.

    Injectable root/checkers let a fixture drive the real runner against a
    temporary tree without re-entering the full drift CLI.
    """
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
    check_paths(manifest, ROOT, errors)
    check_imports(manifest, errors)
    check_hooks(manifest, errors)
    check_skill_pairs(manifest, ROOT, errors)
    check_procedure_policies(manifest, ROOT, errors)
    check_prose_ownership(manifest, ROOT, errors)
    check_skill_reconciliation(manifest, ROOT, errors)
    check_ignored(manifest, errors)
    check_session_contracts(manifest, ROOT, errors)
    check_development_state_tests(errors)
    warnings = check_probe_layout(manifest, ROOT)
    warnings.extend(check_lifecycle_checkers(errors))
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
        f"{len(manifest['pairedSkills'])} paired skills reconciled"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
