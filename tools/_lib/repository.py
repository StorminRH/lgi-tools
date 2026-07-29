"""Repository-root discovery shared by command-line tools."""

from __future__ import annotations

from pathlib import Path
from typing import Optional


def repository_root(start: Optional[Path] = None) -> Path:
    """Return the nearest LGI.tools repository root above *start*."""

    candidate = (start or Path(__file__)).resolve()
    if candidate.is_file():
        candidate = candidate.parent

    for directory in (candidate, *candidate.parents):
        if (directory / "AGENTS.md").is_file() and (directory / "package.json").is_file():
            return directory

    raise RuntimeError(f"unable to locate the repository root from {candidate}")


ROOT = repository_root()
