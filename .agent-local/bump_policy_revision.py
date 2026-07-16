#!/usr/bin/env python3
"""Set the shared agent-policy revision in the manifest and paired skills.

Run from the repository root with the next positive revision number:

    python3 .agent-local/bump_policy_revision.py 4

The script updates `.agent-local/policy-manifest.json` and every
`shared-policy-revision` marker under `.agents/skills` and `.claude/skills`.
It prints each updated path and leaves all other content unchanged.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / ".agent-local" / "policy-manifest.json"
MARKER = re.compile(r"shared-policy-revision: \d+")


def revision_argument() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].isdigit() or int(sys.argv[1]) < 1:
        raise SystemExit("usage: python3 .agent-local/bump_policy_revision.py <positive revision>")
    return int(sys.argv[1])


def update_manifest(revision: int) -> None:
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    payload["policyRevision"] = revision
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(MANIFEST.relative_to(ROOT))


def update_markers(revision: int) -> None:
    for root_name in (".agents", ".claude"):
        for path in sorted((ROOT / root_name / "skills").glob("*/SKILL.md")):
            text = path.read_text(encoding="utf-8")
            updated, count = MARKER.subn(f"shared-policy-revision: {revision}", text)
            if count:
                path.write_text(updated, encoding="utf-8")
                print(path.relative_to(ROOT))


def main() -> None:
    revision = revision_argument()
    update_manifest(revision)
    update_markers(revision)


if __name__ == "__main__":
    main()
