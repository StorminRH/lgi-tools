#!/usr/bin/env python3
"""Wait until the merge SHA is live on GitHub's Production deployment.

Close-out needs a fail-closed Ready signal for the exact merge commit,
not a hand-rolled Vercel CLI poll. This helper uses git-credential
GitHub REST, lists Deployments for the SHA in the Production environment,
and treats the newest deployment status `success` as Ready (GitHub has no
`ready` state). It then confirms that SHA is still the newest Production
tip so `pnpm verify:prod` is not racing a later commit.

Usage:
  python3 tools/cli.py delivery wait-prod-deploy <merge-sha>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from typing import Any, Callable

from tools.delivery.github_api import get_all, github_token

OWNER = "StorminRH"
REPO = "lgi-tools"
DEFAULT_ENVIRONMENT = "Production"
DEFAULT_TIMEOUT_S = 600
DEFAULT_INTERVAL_S = 10
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")

WAITING_STATES = frozenset({"queued", "pending", "in_progress"})
FAILED_STATES = frozenset({"error", "failure"})
SUCCESS_STATE = "success"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)

def newest_by_created(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the newest record by `created_at`, then `id` (API order is not guaranteed)."""

    if not records:
        return None

    def key(row: dict[str, Any]) -> tuple[str, int]:
        created = str(row.get("created_at") or "")
        try:
            row_id = int(row.get("id") or 0)
        except (TypeError, ValueError):
            row_id = 0
        return created, row_id

    return max(records, key=key)

def latest_status_state(statuses: list[dict[str, Any]]) -> str | None:
    newest = newest_by_created(statuses)
    if newest is None:
        return None
    state = newest.get("state")
    return str(state) if state is not None else None

def deployment_url(statuses: list[dict[str, Any]]) -> str | None:
    newest = newest_by_created(statuses)
    if newest is None:
        return None
    for key in ("environment_url", "target_url", "log_url"):
        value = newest.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

def evaluate_prod_deploy(
    expected_sha: str,
    deployments_for_sha: list[dict[str, Any]],
    statuses: list[dict[str, Any]],
    latest_production: dict[str, Any] | None,
) -> tuple[str, str]:
    """Return `(phase, detail)` where phase is waiting | ready | failed.

    `deployments_for_sha` and `statuses` are already scoped to the candidate
    Production deployment for `expected_sha`. `latest_production` is the newest
    Production deployment tip (any SHA) used to reject a superseded Ready.
    """

    if not deployments_for_sha:
        return "waiting", "no Production deployment for merge SHA yet"

    state = latest_status_state(statuses)
    if state is None:
        return "waiting", "Production deployment has no statuses yet"
    if state in WAITING_STATES:
        return "waiting", f"Production deployment state={state}"
    if state in FAILED_STATES:
        return "failed", f"Production deployment state={state}"
    if state == "inactive":
        return "failed", "Production deployment is inactive (superseded or destroyed)"
    if state != SUCCESS_STATE:
        return "waiting", f"Production deployment state={state}"

    tip_sha = str((latest_production or {}).get("sha") or "")
    if tip_sha and tip_sha.lower() != expected_sha.lower():
        return (
            "failed",
            f"Production tip moved to {tip_sha}; expected merge SHA {expected_sha}",
        )
    if not tip_sha:
        return "waiting", "could not read current Production tip SHA"
    return "ready", "Production deployment success for merge SHA"

def fetch_deployments(token: str, *, sha: str | None, environment: str) -> list[dict[str, Any]]:
    query = {"environment": environment, "per_page": "100"}
    if sha is not None:
        query["sha"] = sha
    path = (
        f"/repos/{OWNER}/{REPO}/deployments?"
        + urllib.parse.urlencode(query)
    )
    rows = get_all(path, token)
    return [row for row in rows if isinstance(row, dict)]

def fetch_statuses(token: str, deployment_id: int) -> list[dict[str, Any]]:
    path = (
        f"/repos/{OWNER}/{REPO}/deployments/{deployment_id}/statuses"
        "?per_page=100"
    )
    rows = get_all(path, token)
    return [row for row in rows if isinstance(row, dict)]

def poll_until_ready(
    expected_sha: str,
    *,
    environment: str,
    timeout_s: float,
    interval_s: float,
    sleep: Callable[[float], None] = time.sleep,
    token_factory: Callable[[], str] = github_token,
    now: Callable[[], float] = time.monotonic,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Poll GitHub until the merge SHA is the successful Production tip."""

    require(bool(SHA_RE.fullmatch(expected_sha)), "merge SHA must be a full 40-char hex digest")
    require(timeout_s > 0, "timeout must be positive")
    require(interval_s > 0, "interval must be positive")

    token = token_factory()
    deadline = now() + timeout_s
    last_detail = "not started"
    while now() <= deadline:
        for_sha = fetch_deployments(token, sha=expected_sha, environment=environment)
        candidate = newest_by_created(for_sha)
        statuses: list[dict[str, Any]] = []
        if candidate is not None:
            statuses = fetch_statuses(token, int(candidate["id"]))
        tip_list = fetch_deployments(token, sha=None, environment=environment)
        tip = newest_by_created(tip_list)
        phase, detail = evaluate_prod_deploy(
            expected_sha,
            [candidate] if candidate is not None else [],
            statuses,
            tip,
        )
        last_detail = detail
        if log is not None:
            log(detail)
        if phase == "ready":
            url = deployment_url(statuses)
            return {
                "sha": expected_sha,
                "environment": environment,
                "deployment_id": int(candidate["id"]) if candidate else None,
                "state": SUCCESS_STATE,
                "url": url,
                "production_alias": "https://lgi.tools",
                "detail": detail,
            }
        if phase == "failed":
            raise RuntimeError(detail)
        sleep(interval_s)

    raise RuntimeError(
        f"timed out after {int(timeout_s)}s waiting for Production deploy: {last_detail}"
    )

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Wait until the merge SHA is live on Production (GitHub Deployments).",
    )
    parser.add_argument("merge_sha", help="Full 40-char squash-merge commit SHA")
    parser.add_argument(
        "--environment",
        default=DEFAULT_ENVIRONMENT,
        help=f"GitHub deployment environment name (default: {DEFAULT_ENVIRONMENT})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_S,
        help=f"Seconds to wait before failing (default: {DEFAULT_TIMEOUT_S})",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_S,
        help=f"Seconds between polls (default: {DEFAULT_INTERVAL_S})",
    )
    args = parser.parse_args(argv)

    def log(message: str) -> None:
        print(f"[wait-prod-deploy] {message}", file=sys.stderr)

    result = poll_until_ready(
        args.merge_sha,
        environment=args.environment,
        timeout_s=args.timeout,
        interval_s=args.interval,
        log=log,
    )
    print(json.dumps(result, indent=2))
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
