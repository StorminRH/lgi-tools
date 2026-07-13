#!/usr/bin/env python3
"""Replace repeated arbitrary tracking utilities with the 3.8.2.8 theme scale.

Run from the repository root:

    python3 scripts/tokenize_tracking.py

The script edits TypeScript/TSX files under src/ and prints the replacement
count. Rare, intentionally bespoke tracking values are left for audit review.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPLACEMENTS = {
    "tracking-[0.04em]": "tracking-copy",
    "tracking-[0.06em]": "tracking-ui",
    "tracking-[0.08em]": "tracking-label",
    "tracking-[0.1em]": "tracking-control",
    "tracking-[0.12em]": "tracking-wide",
    "tracking-[0.14em]": "tracking-emphasis",
    "tracking-[0.16em]": "tracking-display",
    "tracking-[0.18em]": "tracking-eyebrow",
}


def main() -> None:
    changed = 0
    replacements = 0
    for path in sorted((ROOT / "src").rglob("*")):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8")
        updated = text
        for before, after in REPLACEMENTS.items():
            count = updated.count(before)
            if count:
                replacements += count
                updated = updated.replace(before, after)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    print(f"updated {changed} files with {replacements} tracking-token replacements")


if __name__ == "__main__":
    main()
