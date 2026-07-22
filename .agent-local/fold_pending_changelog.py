#!/usr/bin/env python3
"""Fold pending changelog fragments into a planned release entry, deterministically.

Planned close-out calls this to absorb ``content/changelog/pending/*.md`` into the
new public version entry. Ordering is a pure function of the inbox contents —
fragments sort by ``date`` then file name, and bullets group by the canonical
category order — so the same inbox always folds the same way. Each folded bullet
keeps a provenance clause (``— included since v<prior-version>``) so the site does
not imply the change first deployed with the rollup.

Fragment shape validation is owned by ``check_pending_changelog.py``; this reader
assumes valid fragments. It is read-only: it reports the folded Markdown and the
list of consumed fragment files, and never edits the changelog or deletes files —
the planned release PR performs the insertion and deletion.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import sys

from check_pending_changelog import CATEGORIES, CATEGORY_HEADING_RE, BULLET_RE, PENDING_DIR


@dataclass(frozen=True)
class Fragment:
    """One pending fragment: its file name, record date, and per-category bullets."""

    name: str
    date: str
    groups: dict[str, list[str]]


def read_fragments(root: Path) -> list[Fragment]:
    """Return valid pending fragments sorted deterministically by (date, file name)."""
    pending = root / PENDING_DIR
    fragments: list[Fragment] = []
    if not pending.is_dir():
        return fragments
    for path in sorted(pending.glob("*.md")):
        if path.name == "README.md":
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        date = ""
        body_start = 0
        if lines and lines[0].strip() == "---":
            closing = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
            if closing is not None:
                for raw in lines[1:closing]:
                    key, _, value = raw.partition(":")
                    if key.strip() == "date":
                        date = value.strip()
                body_start = closing + 1
        groups: dict[str, list[str]] = {}
        current: str | None = None
        for raw in lines[body_start:]:
            line = raw.strip()
            heading = CATEGORY_HEADING_RE.match(line)
            if heading and heading.group(1) in CATEGORIES:
                current = heading.group(1)
                groups.setdefault(current, [])
                continue
            bullet = BULLET_RE.match(line)
            if bullet and current is not None:
                groups[current].append(bullet.group(1))
        fragments.append(Fragment(path.name, date, groups))
    fragments.sort(key=lambda fragment: (fragment.date, fragment.name))
    return fragments


def fold(fragments: list[Fragment], prior_version: str) -> list[tuple[str, list[str]]]:
    """Return absorbed bullets grouped by canonical category, with provenance.

    Categories keep their canonical order; within a category the bullets follow
    the deterministic fragment order. Each bullet gains a plain-text provenance
    clause so a reader can see it shipped out-of-band before the rollup.
    """
    suffix = f" — included since v{prior_version}"
    folded: list[tuple[str, list[str]]] = []
    for category in CATEGORIES:
        bullets = [
            bullet + suffix
            for fragment in fragments
            for bullet in fragment.groups.get(category, [])
        ]
        if bullets:
            folded.append((category, bullets))
    return folded


def render(folded: list[tuple[str, list[str]]]) -> str:
    """Render folded category groups as changelog-entry Markdown."""
    blocks = [
        "\n".join([f"#### {category}", *(f"- {bullet}" for bullet in bullets)])
        for category, bullets in folded
    ]
    return "\n\n".join(blocks)


def main() -> int:
    """Print the deterministic folded Markdown and the consumed fragment files."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prior-version", required=True, help="Last published version before this rollup.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    fragments = read_fragments(args.root.resolve())
    print(render(fold(fragments, args.prior_version)))
    print()
    print("# consumed fragments (delete in the release PR):")
    for fragment in fragments:
        print(f"# {PENDING_DIR}/{fragment.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
