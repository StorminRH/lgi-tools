#!/usr/bin/env python3
"""Run the complete ordinary-safe repository policy compatibility gate."""

from __future__ import annotations

import subprocess
import sys

from tools._lib.repository import ROOT


COMMANDS = (
    ("policy", "check"),
    ("test",),
    ("policy", "check-doc-refs", "--check", "--pretty"),
)


def main() -> int:
    """Run policy, fixture, and document checks without lifecycle state."""

    dispatcher = str(ROOT / "tools/cli.py")
    for arguments in COMMANDS:
        result = subprocess.call(
            [sys.executable, dispatcher, *arguments],
            cwd=ROOT,
        )
        if result != 0:
            return result
    print("complete agent policy check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
