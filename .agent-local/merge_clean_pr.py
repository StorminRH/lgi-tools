#!/usr/bin/env python3
"""Revalidate a clean LGI.tools PR and squash-merge it through GitHub REST.

The script uses the credential already held by git, prints no credential data,
and refuses to merge unless the live Greptile summary, inline comments, CI,
mergeability, and expected head SHA all satisfy the repository close-out gate.

Usage:
  python3 .agent-local/merge_clean_pr.py 228 <expected-head-sha>
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse

from github_api import github_token, request


OWNER = "StorminRH"
REPO = "lgi-tools"
GREPTILE = "greptile-apps[bot]"
PASSING_CONCLUSIONS = {"success", "neutral", "skipped"}


def get(path: str, token: str) -> object:
    body, _ = request("GET", path, token, None)
    return body


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def actor_login(item: dict[str, object]) -> str:
    user = item.get("user")
    return str(user.get("login", "")) if isinstance(user, dict) else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pr", type=int)
    parser.add_argument("expected_head")
    args = parser.parse_args()

    token = github_token()
    root = f"/repos/{OWNER}/{REPO}"
    pr = get(f"{root}/pulls/{args.pr}", token)
    require(isinstance(pr, dict), "pull request response was not an object")

    head = pr.get("head")
    require(isinstance(head, dict), "pull request has no head data")
    head_sha = str(head.get("sha", ""))
    branch = str(head.get("ref", ""))
    require(head_sha == args.expected_head, f"head moved: {head_sha}")
    require(pr.get("state") == "open", "pull request is not open")
    require(not pr.get("draft"), "pull request is still a draft")
    require(pr.get("mergeable") is True, "pull request is not mergeable")
    require(pr.get("mergeable_state") == "clean", f"merge state is {pr.get('mergeable_state')}")

    issue_comments = get(f"{root}/issues/{args.pr}/comments?per_page=100", token)
    inline_comments = get(f"{root}/pulls/{args.pr}/comments?per_page=100", token)
    require(isinstance(issue_comments, list), "issue comments response was not a list")
    require(isinstance(inline_comments, list), "inline comments response was not a list")

    greptile_summaries = [
        item
        for item in issue_comments
        if isinstance(item, dict)
        and actor_login(item) == GREPTILE
        and "Greptile Summary" in str(item.get("body", ""))
    ]
    require(greptile_summaries, "no Greptile summary found")
    summary = max(greptile_summaries, key=lambda item: str(item.get("updated_at", "")))
    summary_body = str(summary.get("body", ""))
    summary_updated = str(summary.get("updated_at", ""))
    require("Confidence Score: 5/5" in summary_body, "live Greptile score is not 5/5")
    require(head_sha in summary_body, "live Greptile summary does not name the current head")

    inline_findings = [
        item for item in inline_comments
        if isinstance(item, dict) and actor_login(item) == GREPTILE
    ]
    require(not inline_findings, f"Greptile has {len(inline_findings)} inline finding(s)")

    newer_greptile = [
        item
        for item in issue_comments
        if isinstance(item, dict)
        and actor_login(item) == GREPTILE
        and item.get("id") != summary.get("id")
        and str(item.get("updated_at", item.get("created_at", ""))) > summary_updated
    ]
    require(not newer_greptile, "a Greptile comment is newer than the live summary")

    checks = get(f"{root}/commits/{head_sha}/check-runs?per_page=100", token)
    require(isinstance(checks, dict), "check-runs response was not an object")
    runs = checks.get("check_runs")
    require(isinstance(runs, list) and runs, "no check runs found")
    required_names = {"Greptile Review", "semgrep-cloud-platform/scan", "test"}
    names = {str(run.get("name", "")) for run in runs if isinstance(run, dict)}
    require(required_names <= names, f"missing required checks: {sorted(required_names - names)}")
    failing = [
        f"{run.get('name')}={run.get('status')}/{run.get('conclusion')}"
        for run in runs
        if isinstance(run, dict)
        and (run.get("status") != "completed" or run.get("conclusion") not in PASSING_CONCLUSIONS)
    ]
    require(not failing, f"non-passing checks: {', '.join(failing)}")

    merge, _ = request(
        "PUT",
        f"{root}/pulls/{args.pr}/merge",
        token,
        {
            "merge_method": "squash",
            "commit_title": f"{pr.get('title')} (#{args.pr})",
        },
    )
    require(isinstance(merge, dict) and merge.get("merged") is True, f"merge failed: {merge}")

    encoded_branch = urllib.parse.quote(branch, safe="")
    request("DELETE", f"{root}/git/refs/heads/{encoded_branch}", token, None)

    print(json.dumps({
        "pr": args.pr,
        "head": head_sha,
        "greptile": "5/5, zero findings",
        "checks": sorted(names),
        "merge_sha": merge.get("sha"),
        "remote_branch_deleted": branch,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
