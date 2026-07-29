#!/usr/bin/env python3
"""Compatibility entrypoint for frozen artifacts; use tools/cli.py instead."""
# Dispatch: lifecycle resolve

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
raise SystemExit(
    subprocess.call(
        [
            sys.executable,
            str(ROOT / "tools/cli.py"),
            "lifecycle",
            "resolve",
            *sys.argv[1:],
        ],
        cwd=ROOT,
    )
)
