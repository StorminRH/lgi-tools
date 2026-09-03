#!/usr/bin/env python3
"""Count app-facing files on development that staging does not have yet.

Run after a land onto ``development``. That is when ``origin/development``
includes this Ordered work step. Display is ``n/100``. Promote is due at
80. Documentation, policy, and agent files do not count.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys

from tools._lib.repository import ROOT

PROMOTE_BAR = 100
PROMOTE_TRIGGER = 80
DEFAULT_BASE = "origin/staging"
DEFAULT_HEAD = "origin/development"

EXCLUDED_PREFIXES = (
    ".cursor/",
    ".agents/",
    "docs/",
    "scripts/",
    "content/changelog/",
    ".github/PULL_REQUEST_TEMPLATE",
    ".github/ISSUE_TEMPLATE/",
)

EXCLUDED_BASENAMES = frozenset(
    {
        "AGENTS.md",
        "CLAUDE.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        "SECURITY.md",
        ".fallowrc.json",
    }
)

@dataclass(frozen=True)
class AppFacingCount:
    """One classified ``staging...development`` name list."""

    included: tuple[str, ...]
    excluded: tuple[str, ...]

    @property
    def app_facing(self) -> int:
        return len(self.included)

    @property
    def by_directory(self) -> tuple[tuple[str, int], ...]:
        counts: Counter[str] = Counter(
            path.split("/", 1)[0] for path in self.included
        )
        return tuple(sorted(counts.items(), key=lambda item: (-item[1], item[0])))

def normalize_path(relpath: str) -> str:
    """Return a repo-relative POSIX path."""
    path = relpath.replace("\\", "/")
    while path.startswith("./"):
        path = path[2:]
    return path

def path_is_excluded(relpath: str) -> bool:
    """Return whether this path is documentation, policy, or agent material."""
    path = normalize_path(relpath)
    if path.rsplit("/", 1)[-1] in EXCLUDED_BASENAMES:
        return True
    for prefix in EXCLUDED_PREFIXES:
        bare = prefix.rstrip("/")
        if path == bare or path.startswith(f"{bare}/") or path.startswith(prefix):
            return True
    return False

def classify_paths(relpaths: list[str]) -> AppFacingCount:
    """Split a name list into app-facing and excluded paths."""
    included: list[str] = []
    excluded: list[str] = []
    for raw in relpaths:
        path = normalize_path(raw)
        if not path:
            continue
        if path_is_excluded(path):
            excluded.append(path)
        else:
            included.append(path)
    return AppFacingCount(included=tuple(included), excluded=tuple(excluded))

def measure(
    root: Path,
    base: str = DEFAULT_BASE,
    head: str = DEFAULT_HEAD,
) -> AppFacingCount:
    """Classify ``base...head`` names under ``root``."""
    return classify_paths(list_changed_paths(root, base, head))

def try_app_facing_count(root: Path) -> int | None:
    """Return the app-facing count, or None when git cannot measure it."""
    try:
        return measure(root).app_facing
    except (RuntimeError, OSError):
        return None

def list_changed_paths(root: Path, base: str, head: str) -> list[str]:
    """Return ``git diff --name-only base...head`` paths."""
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or "git diff failed"
        raise RuntimeError(detail)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]

def render_count(count: AppFacingCount, *, list_files: bool = False) -> str:
    """Return the handoff block for one classified range."""
    lines = [f"app-facing {count.app_facing}/{PROMOTE_BAR}"]
    for directory, total in count.by_directory:
        lines.append(f"{directory} {total}")
    lines.append(f"excluded {len(count.excluded)}")
    if count.app_facing >= PROMOTE_TRIGGER:
        lines.append("promote is due")
    if list_files:
        lines.append("files")
        lines.extend(count.included)
    return "\n".join(lines)

def main(argv: list[str] | None = None) -> int:
    """Print the app-facing count for ``staging...development``."""
    parser = argparse.ArgumentParser(
        description="Count app-facing files on development that staging does not have yet."
    )
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--head", default=DEFAULT_HEAD)
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print each app-facing path after the directory totals.",
    )
    args = parser.parse_args(argv)
    try:
        paths = list_changed_paths(args.root, args.base, args.head)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 2
    print(render_count(classify_paths(paths), list_files=args.list))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
