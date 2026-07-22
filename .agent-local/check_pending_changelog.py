#!/usr/bin/env python3
"""Validate the pending changelog fragment inbox.

Owns one decision: whether every fragment under ``content/changelog/pending/``
is a well-formed, unpublished release note that a planned release can fold into
a public version entry without ambiguity. The live changelog loader never reads
this directory and the release-consistency checker treats it as neutral, so this
is the only gate on fragment shape. The checker is read-only.

A fragment carries a small frontmatter block (an ISO ``date`` plus an optional
``source``) followed by one or more ``#### <Category>`` groups using the closed
changelog vocabulary. It never carries a version heading, because the version is
unknown until a planned release absorbs it. See
``docs/workflows/schema/changelog-pending.md``.
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path
import re
import sys

from checker_common import Finding, run_checker


PENDING_DIR = "content/changelog/pending"
# The closed changelog category vocabulary, mirroring CHANGE_TYPES in
# src/features/changelog/parse.ts and docs/workflows/schema/changelog-entry.md.
CATEGORIES = ("Added", "Changed", "Fixed", "Removed")
FRONTMATTER_KEYS = ("date", "source")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MASTER_FILE_RE = re.compile(r"^v[\d.]+\.md$")
CATEGORY_HEADING_RE = re.compile(r"^####\s+(.+?)\s*$")
BULLET_RE = re.compile(r"^-\s+(.+?)\s*$")
# The renderer prints Markdown literally, so fragments stay plain text: reject
# bold, inline code, and links (the same restriction as changelog-entry.md).
MARKUP_RE = re.compile(r"\*\*|__|`|\[[^\]]*\]\([^)]*\)")


def _parse_frontmatter(
    rel: str, lines: list[str], findings: list[Finding]
) -> tuple[dict[str, str], int]:
    """Return the fragment's frontmatter mapping and the body's start index.

    A missing or unterminated frontmatter block is a fatal shape error; the body
    index returned in that case is past the end so no body parsing runs.
    """
    if not lines or lines[0].strip() != "---":
        findings.append(Finding(rel, 1, "fragment must open with a --- frontmatter block", "error"))
        return {}, len(lines)
    closing = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if closing is None:
        findings.append(Finding(rel, 1, "fragment frontmatter is not terminated with ---", "error"))
        return {}, len(lines)

    frontmatter: dict[str, str] = {}
    for offset, raw in enumerate(lines[1:closing], start=2):
        if not raw.strip():
            continue
        match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$", raw)
        if not match:
            findings.append(Finding(rel, offset, f"frontmatter line is not a key: value pair: {raw.strip()!r}", "error"))
            continue
        key, value = match.group(1), match.group(2).strip()
        if key not in FRONTMATTER_KEYS:
            findings.append(Finding(rel, offset, f"unsupported frontmatter key {key!r}; allowed keys are {list(FRONTMATTER_KEYS)}", "error"))
            continue
        if key in frontmatter:
            findings.append(Finding(rel, offset, f"duplicate frontmatter key {key!r}", "error"))
            continue
        frontmatter[key] = value

    date = frontmatter.get("date")
    if date is None:
        findings.append(Finding(rel, 1, "frontmatter is missing the required date", "error"))
    elif not ISO_DATE_RE.match(date):
        findings.append(Finding(rel, 1, f"date must be an ISO YYYY-MM-DD value, got {date!r}", "error"))
    else:
        try:
            _dt.date.fromisoformat(date)
        except ValueError:
            findings.append(Finding(rel, 1, f"date is not a real calendar date: {date!r}", "error"))
    return frontmatter, closing + 1


def _parse_body(
    rel: str, lines: list[str], start: int, findings: list[Finding]
) -> list[tuple[str, str]]:
    """Return the (category, bullet) pairs a fragment publishes, reporting shape errors."""
    bullets: list[tuple[str, str]] = []
    current: str | None = None
    group_bullets = 0
    saw_group = False

    def close_group(line_number: int) -> None:
        nonlocal group_bullets
        if current is not None and group_bullets == 0:
            findings.append(Finding(rel, line_number, f"category {current!r} has no bullets", "error"))
        group_bullets = 0

    for index in range(start, len(lines)):
        line_number = index + 1
        line = lines[index].strip()
        if not line:
            continue
        if line.startswith("### ") or line.startswith("## ") or re.match(r"^#\s", line):
            findings.append(Finding(rel, line_number, "a fragment must not contain a version or master heading", "error"))
            continue
        category_match = CATEGORY_HEADING_RE.match(line)
        if category_match:
            close_group(line_number)
            category = category_match.group(1)
            if category not in CATEGORIES:
                findings.append(Finding(rel, line_number, f"unsupported category {category!r}; allowed categories are {list(CATEGORIES)}", "error"))
                current = None
                continue
            current = category
            saw_group = True
            continue
        bullet_match = BULLET_RE.match(line)
        if bullet_match:
            if current is None:
                findings.append(Finding(rel, line_number, "bullet is not under a #### <Category> group", "error"))
                continue
            text = bullet_match.group(1)
            if MARKUP_RE.search(text):
                findings.append(Finding(rel, line_number, "bullet must be plain text (no bold, inline code, or links)", "error"))
            group_bullets += 1
            bullets.append((current, text))
            continue
        findings.append(Finding(rel, line_number, f"unrecognized fragment line: {line!r}", "error"))

    close_group(len(lines))
    if not saw_group:
        findings.append(Finding(rel, 1, "fragment must define at least one #### <Category> group", "error"))
    return bullets


def collect_findings(root: Path) -> list[Finding]:
    """Report shape and duplication problems across the pending fragment inbox."""
    findings: list[Finding] = []
    pending = root / PENDING_DIR
    if not pending.is_dir():
        return findings

    seen_bullets: dict[tuple[str, str], str] = {}
    for path in sorted(pending.glob("*.md")):
        if path.name == "README.md":
            continue
        rel = path.relative_to(root).as_posix()
        if path.name == "_preamble.md" or MASTER_FILE_RE.match(path.name):
            findings.append(Finding(rel, 1, "fragment file name must not look like a published changelog file", "error"))
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        _frontmatter, body_start = _parse_frontmatter(rel, lines, findings)
        for category, bullet in _parse_body(rel, lines, body_start, findings):
            key = (category, bullet)
            prior = seen_bullets.get(key)
            if prior is None:
                seen_bullets[key] = rel
            elif prior == rel:
                findings.append(Finding(rel, 1, f"duplicate {category} note within the fragment: {bullet!r}", "error"))
            else:
                findings.append(Finding(rel, 1, f"duplicate {category} note already defined in {prior}: {bullet!r}", "error"))
    return findings


def main() -> int:
    """Run the pending-changelog checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
