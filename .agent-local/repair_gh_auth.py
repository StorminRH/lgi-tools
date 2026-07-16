#!/usr/bin/env python3
"""Repair GitHub CLI auth from git's already-working credential helper.

The credential stays in memory and is passed to `gh auth login --with-token`
through stdin. It is never printed or written into the repository.
"""

from __future__ import annotations

import subprocess

from github_api import github_token


def run(command: list[str], *, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        input=input_text,
        text=True,
        capture_output=True,
        check=True,
    )


def main() -> None:
    token = github_token()
    login = run(
        [
            "gh",
            "auth",
            "login",
            "--hostname",
            "github.com",
            "--git-protocol",
            "https",
            "--with-token",
        ],
        input_text=token,
    )
    if login.stdout.strip():
        print(login.stdout.strip())
    if login.stderr.strip():
        print(login.stderr.strip())

    status = run(["gh", "auth", "status", "--hostname", "github.com"])
    print(status.stdout.strip() or status.stderr.strip())
    whoami = run(["gh", "api", "user", "--jq", ".login"])
    print(f"GitHub API login: {whoami.stdout.strip()}")


if __name__ == "__main__":
    main()
