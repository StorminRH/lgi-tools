#!/usr/bin/env python3
"""Call GitHub's REST API with the credential already used by git.

Examples:
  python3 .agent-local/github_api.py GET /repos/OWNER/REPO/pulls/123
  python3 .agent-local/github_api.py POST /repos/OWNER/REPO/pulls \
    --field title='My PR' --field head=branch --field base=main --body-file pr.md
  python3 .agent-local/github_api.py GET /repos/OWNER/REPO/issues/123/comments --paginate

The response is printed as JSON. The credential is read from git's credential
helper in memory and is never printed or written to disk.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def github_token() -> str:
    result = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        check=True,
        capture_output=True,
        text=True,
    )
    values = dict(
        line.split("=", 1)
        for line in result.stdout.splitlines()
        if "=" in line
    )
    token = values.get("password")
    if not token:
        raise RuntimeError("git credential helper returned no GitHub password")
    return token


def request(method: str, path: str, token: str, data: object | None) -> tuple[object, dict[str, str]]:
    url = f"https://api.github.com{path}"
    payload = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "lgi-tools-session-helper",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read()
            return (json.loads(body) if body else None), dict(response.headers)
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise RuntimeError(f"GitHub API {error.code}: {detail}") from error


def next_path(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for item in link_header.split(","):
        url_part, *params = item.split(";")
        if any('rel="next"' in param for param in params):
            url = url_part.strip().strip("<>")
            parsed = urllib.parse.urlparse(url)
            return f"{parsed.path}?{parsed.query}"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("method", choices=("GET", "POST", "PATCH"))
    parser.add_argument("path")
    parser.add_argument("--data", type=argparse.FileType("r"))
    parser.add_argument("--field", action="append", default=[])
    parser.add_argument("--body-file", type=argparse.FileType("r"))
    parser.add_argument("--paginate", action="store_true")
    args = parser.parse_args()

    data = json.load(args.data) if args.data else None
    if args.field or args.body_file:
        if data is not None:
            raise RuntimeError("use --data or --field/--body-file, not both")
        data = {}
        for field in args.field:
            key, separator, value = field.partition("=")
            if not separator:
                raise RuntimeError(f"invalid --field value: {field}")
            try:
                data[key] = json.loads(value)
            except json.JSONDecodeError:
                data[key] = value
        if args.body_file:
            data["body"] = args.body_file.read()
    token = github_token()
    path = args.path
    pages: list[object] = []

    while path:
        body, headers = request(args.method, path, token, data)
        if args.paginate:
            if not isinstance(body, list):
                raise RuntimeError("--paginate requires a list response")
            pages.extend(body)
            path = next_path(headers.get("Link"))
            data = None
        else:
            print(json.dumps(body, indent=2))
            return 0

    print(json.dumps(pages, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
