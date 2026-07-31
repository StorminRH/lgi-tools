#!/usr/bin/env python3
"""Fail-open compatibility target for sessions that cached the removed hook."""

from __future__ import annotations


def main() -> int:
    """Allow an already-running harness to continue without a reminder."""

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
