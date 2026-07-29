#!/usr/bin/env python3
"""Compatibility entrypoint for frozen artifacts; use tools/cli.py instead."""
# Dispatch: policy check-all

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    return subprocess.call(
        [
            sys.executable,
            str(ROOT / "tools/cli.py"),
            "policy",
            "check-all",
            *sys.argv[1:],
        ],
        cwd=ROOT,
    )


if __name__ == "__main__":
    raise SystemExit(main())
