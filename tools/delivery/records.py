"""Deterministic candidate records; delivery proof is checked separately."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import re

FORMAT = "2"
STANDARD = "docs/workflows/schema/session-as-built-v2.md"
ID = r"[A-Za-z0-9][A-Za-z0-9._-]*"
LINEAR = r"https://linear\.app/[a-zA-Z0-9_-]+/issue/[A-Z]+-\d+(?:/[^\s#]+)?"


def fields(path: Path) -> dict[str, str]:
    return {key: value.strip().strip("`") for key, value in re.findall(
        r"^\*\*([^\n*]+):\*\*[ \t]*([^\n]*)$", path.read_text(), re.MULTILINE
    )}


def values(value: str) -> list[str]:
    return [] if value == "None." else [part.strip() for part in value.split(",") if part.strip()]


def outcomes(path: Path) -> list[str]:
    return re.findall(rf"^- \[({ID})\] (?:Added|Changed|Fixed|Removed): \S.+$", path.read_text(), re.MULTILINE)


def violations(path: Path, root: Path, contract: Path | None = None, plan: Path | None = None) -> list[str]:
    text = path.read_text()
    data = fields(path)
    errors: list[str] = []
    for key, expected in {"Record format": FORMAT, "Record status": "Candidate", "Record standard": STANDARD}.items():
        if data.get(key) != expected:
            errors.append(f"{key} must be {expected!r}")
    labels = re.findall(r"^\*\*([^\n*]+):\*\*", text, re.MULTILINE)
    if len(labels) != len(set(labels)):
        errors.append("record markers must be unique")
    for key in ("Delivery ID", "Branch"):
        if not re.fullmatch(ID if key == "Delivery ID" else r"[^\s]+", data.get(key, "")):
            errors.append(f"{key} is missing or invalid")
    if not re.fullmatch(LINEAR, data.get("Receipt issue", "")):
        errors.append("Receipt issue must be a stable Linear issue URL")
    if not re.fullmatch(r"https://github\.com/[\w.-]+/[\w.-]+/pull/[1-9]\d*", data.get("PR", "")):
        errors.append("PR must be a canonical GitHub pull request URL")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data.get("Recorded", "")):
        errors.append("Recorded must be a YYYY-MM-DD date")
    kind = data.get("Scope")
    if kind not in {"session", "ordinary", "partial"}:
        errors.append("Scope must be session, ordinary, or partial")
    if kind == "session":
        first = next((line for line in text.splitlines() if line.strip()), "")
        if not first.startswith(f"# Session {path.stem} As-Built — "):
            errors.append("first heading must identify the session filename")
        for key, supplied, directory in (("Contract", contract, "session-contracts"), ("Plan", plan, "session-plans")):
            rel = data.get(key, "")
            target = supplied or root / rel
            if not rel.startswith(f"docs/{directory}/") or target.resolve() != (root / rel).resolve() or not target.resolve().is_relative_to((root / "docs" / directory).resolve()) or not target.is_file():
                errors.append(f"{key} must identify the existing frozen session artifact")
                continue
            if target.stem != path.stem:
                errors.append(f"{key} must identify session {path.stem}")
            if data.get(f"{key} digest") != "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest():
                errors.append(f"{key} digest is stale")
        plan_path = plan or root / data.get("Plan", "")
        if plan_path.resolve().is_relative_to((root / "docs/session-plans").resolve()) and plan_path.is_file():
            expected = list(dict.fromkeys(re.findall(r"^\s*-\s+\*\*(SC-\d+)\s+—", plan_path.read_text(), re.MULTILINE)))
            if not expected or values(data.get("Criteria", "")) != expected:
                errors.append("Criteria must list every plan SC-N exactly once in order")
    else:
        for key in ("Contract", "Contract digest", "Plan", "Plan digest", "Criteria"):
            if data.get(key) != "None.":
                errors.append(f"{key} must be None. for ordinary or partial scope")
        if kind == "partial" and not re.fullmatch(r"\d+(?:\.\d+)+: OW-?\d+(?:, OW-?\d+)*", data.get("Partial scope", "")):
            errors.append("Partial scope must identify the session and completed OWs")
    roles = values(data.get("Review roles", ""))
    if not roles or len(roles) != len(set(roles)) or any(not re.fullmatch(ID, role) for role in roles):
        errors.append("Review roles must list unique required review seats")
    sections = re.findall(r"^## (.+)$", text, re.MULTILINE)
    if sections.count("Delivered outcome") != 1 or len(sections) != len(set(sections)):
        errors.append("record requires one Delivered outcome section and unique optional sections")
    outcome_ids = outcomes(path)
    if not outcome_ids or len(outcome_ids) != len(set(outcome_ids)):
        errors.append("Delivered outcome requires unique [outcome-id] change bullets")
    previous = values(data.get("Prior deliveries", ""))
    if "Prior deliveries" not in data or len(previous) != len(set(previous)) or any(not re.fullmatch(ID, item) for item in previous) or data.get("Delivery ID") in previous:
        errors.append("Prior deliveries must be None. or unique earlier delivery IDs")
    if "## Divergences from plan" in text:
        body = text.split("## Divergences from plan", 1)[1].split("\n## ", 1)[0].strip()
        items = re.split(r"(?m)^- \*\*Plan statement:\*\* ", body)
        if body != "None." and (items[0].strip() or len(items) < 2):
            errors.append("divergences require structured Plan statement items")
        for item in items[1:]:
            for key in ("Built instead", "Why"):
                if not re.search(rf"(?m)^\s+\*\*{key}:\*\* \S.+", item):
                    errors.append(f"divergence requires {key}")
            if not re.search(r"(?m)^\s+\*\*Authority:\*\* (?:Operator|Evidence): \S.+", item):
                errors.append("divergence Authority requires existing Operator: or Evidence: authority")
    return errors


def collection_violations(paths: list[Path], root: Path | None = None) -> list[str]:
    errors: list[str] = []
    deliveries: dict[str, Path] = {}
    emitted: dict[str, Path] = {}
    for path in paths:
        data = fields(path)
        if "Record format" not in data:
            continue
        if data["Record format"] != FORMAT:
            errors.append(f"{path}: unsupported Record format")
            continue
        if root is not None:
            errors.extend(f"{path}: {error}" for error in violations(path, root))
        delivery = data.get("Delivery ID", "")
        if delivery in deliveries:
            errors.append(f"{path}: duplicate Delivery ID {delivery}")
        deliveries[delivery] = path
        for outcome in outcomes(path):
            if outcome in emitted:
                errors.append(f"{path}: outcome {outcome} already delivered by {emitted[outcome]}")
            emitted[outcome] = path
    for delivery, path in deliveries.items():
        for prior in values(fields(path).get("Prior deliveries", "None.")):
            if prior not in deliveries or prior == delivery:
                errors.append(f"{path}: prior delivery {prior} is missing or self-referential")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    errors = violations(args.record, args.root)
    print("\n".join(errors) if errors else "Artifact ready; external delivery evidence has not been verified.")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
