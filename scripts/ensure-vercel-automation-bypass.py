#!/usr/bin/env python3
"""Ensure VERCEL_AUTOMATION_BYPASS_SECRET exists and is written to .env.local.

Never prints the secret value. Uses the local Vercel CLI auth token and the
linked .vercel/project.json. Create or rotate via PATCH
/v1/projects/{id}/protection-bypass; the secret is the protectionBypass map key.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT_JSON = ROOT / ".vercel" / "project.json"
ENV_LOCAL = ROOT / ".env.local"
SECRET_KEY = "VERCEL_AUTOMATION_BYPASS_SECRET"


def die(message: str, code: int = 1) -> None:
    print(f"✗ {message}", file=sys.stderr)
    raise SystemExit(code)


def vercel_auth_token() -> str:
    if token := os.environ.get("VERCEL_TOKEN"):
        return token
    candidates: list[Path] = []
    if xdg := os.environ.get("XDG_DATA_HOME"):
        candidates.append(Path(xdg) / "com.vercel.cli" / "auth.json")
    home = Path.home()
    candidates.extend(
        [
            home / "Library/Application Support/com.vercel.cli/auth.json",
            home / ".local/share/com.vercel.cli/auth.json",
        ]
    )
    for path in candidates:
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        token = data.get("token")
        if isinstance(token, str) and token:
            return token
    die("No Vercel auth token found (run `vercel login` or set VERCEL_TOKEN)")


def load_project() -> tuple[str, str | None]:
    if not PROJECT_JSON.is_file():
        die(f"Missing {PROJECT_JSON}; run `vercel link` first")
    data = json.loads(PROJECT_JSON.read_text(encoding="utf-8"))
    project_id = data.get("projectId") or data.get("projectName")
    if not isinstance(project_id, str) or not project_id:
        die("`.vercel/project.json` has no projectId")
    org_id = data.get("orgId")
    return project_id, org_id if isinstance(org_id, str) else None


def api_request(method: str, url: str, token: str, body: dict | None = None) -> dict:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        # Never echo response bodies that may contain secrets.
        die(f"Vercel API {error.code} for {method} {url.split('?', 1)[0]}")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        die("Vercel API returned non-JSON")
    if not isinstance(parsed, dict):
        die("Vercel API returned unexpected JSON shape")
    return parsed


def automation_secrets(protection_bypass: dict) -> list[str]:
    secrets: list[str] = []
    for secret, meta in protection_bypass.items():
        if not isinstance(secret, str) or not isinstance(meta, dict):
            continue
        if meta.get("scope") == "automation-bypass":
            secrets.append(secret)
    return secrets


def fetch_project(token: str, project_id: str, team_id: str | None) -> dict:
    query = urllib.parse.urlencode({"teamId": team_id} if team_id else {})
    url = f"https://api.vercel.com/v9/projects/{project_id}"
    if query:
        url = f"{url}?{query}"
    return api_request("GET", url, token)


def patch_bypass(token: str, project_id: str, team_id: str | None, body: dict) -> dict:
    query = urllib.parse.urlencode({"teamId": team_id} if team_id else {})
    url = f"https://api.vercel.com/v1/projects/{project_id}/protection-bypass"
    if query:
        url = f"{url}?{query}"
    return api_request("PATCH", url, token, body)


def ensure_secret(token: str, project_id: str, team_id: str | None, *, rotate: bool) -> str:
    project = fetch_project(token, project_id, team_id)
    existing = automation_secrets(project.get("protectionBypass") or {})

    if rotate and existing:
        # Prefer the secret already marked as the system env var, else the first.
        bypass_map = project.get("protectionBypass") or {}
        revoked = existing[0]
        for candidate in existing:
            meta = bypass_map.get(candidate) or {}
            if meta.get("isEnvVar") is True:
                revoked = candidate
                break
        body = patch_bypass(
            token,
            project_id,
            team_id,
            {"revoke": {"secret": revoked, "regenerate": True}},
        )
        secrets = automation_secrets(body.get("protectionBypass") or {})
        if not secrets:
            # Some responses omit the map; re-fetch.
            project = fetch_project(token, project_id, team_id)
            secrets = automation_secrets(project.get("protectionBypass") or {})
        if not secrets:
            die("Rotate succeeded but no automation-bypass secret was returned")
        return secrets[0]

    if existing:
        return existing[0]

    body = patch_bypass(
        token,
        project_id,
        team_id,
        {"generate": {"note": "Playwright / agent production proof"}},
    )
    secrets = automation_secrets(body.get("protectionBypass") or {})
    if not secrets:
        project = fetch_project(token, project_id, team_id)
        secrets = automation_secrets(project.get("protectionBypass") or {})
    if not secrets:
        die("Create succeeded but no automation-bypass secret was returned")
    return secrets[0]


def upsert_env_local(path: Path, key: str, value: str) -> str:
    """Write key=value into path. Returns 'created' | 'updated' | 'unchanged'."""
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    pattern = re.compile(rf"(?m)^{re.escape(key)}=.*$")
    match = pattern.search(text)
    line = f"{key}={value}"
    if match:
        if match.group(0) == line:
            return "unchanged"
        path.write_text(pattern.sub(line, text), encoding="utf-8")
        return "updated"
    if text and not text.endswith("\n"):
        text += "\n"
    path.write_text(text + line + "\n", encoding="utf-8")
    return "created"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rotate",
        action="store_true",
        help="Revoke the current automation bypass and regenerate a new secret",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=ENV_LOCAL,
        help="Path to write (default: .env.local)",
    )
    args = parser.parse_args()

    token = vercel_auth_token()
    project_id, team_id = load_project()
    secret = ensure_secret(token, project_id, team_id, rotate=args.rotate)
    if not re.fullmatch(r"[a-zA-Z0-9]{32}", secret):
        die("Secret from Vercel did not match the expected 32-char alphanumeric shape")

    action = upsert_env_local(args.env_file, SECRET_KEY, secret)
    print(f"✓ automation bypass ready ({len(secret)} chars)")
    print(f"✓ {SECRET_KEY} {action} in {args.env_file.relative_to(ROOT)}")
    print("  (value not printed; add the same key to Cursor Cloud Agents → Secrets)")
    if args.rotate:
        print("  rotated: prior bypass invalidated; redeploy if deployments must pick up the new system env")


if __name__ == "__main__":
    main()
