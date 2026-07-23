#!/usr/bin/env python3
"""Revalidate a clean LGI.tools PR and squash-merge it through GitHub REST.

The script uses the credential already held by git, prints no credential data,
and refuses to merge unless the live Greptile summary, inline comments, CI,
mergeability, and expected head SHA all satisfy the repository close-out gate.
Greptile is the gate of record; other bots (e.g. CodeRabbit) are advisory and do
not appear in the required-check set.

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
REQUIRED_CHECKS = {"Greptile Review", "semgrep-cloud-platform/scan", "test"}
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


def live_inline_findings(
    inline_comments: list[object], head_sha: str
) -> list[dict[str, object]]:
    """Greptile inline comments that still apply to the current head.

    Greptile leaves a resolved finding's comment in place but keeps its
    ``commit_id`` on the last head where the finding was live; a finding that
    still applies is re-anchored to the current head. Counting only comments on
    the current head (the same signal ``poll_pr_gate.py`` uses) means a resolved
    finding stops blocking while a live one still fails the gate.
    """
    return [
        item
        for item in inline_comments
        if isinstance(item, dict)
        and actor_login(item) == GREPTILE
        and str(item.get("commit_id", "")) == head_sha
    ]


def greptile_summary(issue_comments: list[object]) -> dict[str, object] | None:
    """The newest Greptile summary comment, or None if Greptile has not posted one."""
    summaries = [
        item
        for item in issue_comments
        if isinstance(item, dict)
        and actor_login(item) == GREPTILE
        and "Greptile Summary" in str(item.get("body", ""))
    ]
    if not summaries:
        return None
    return max(summaries, key=lambda item: str(item.get("updated_at", "")))


def merge_blockers(
    pr: dict[str, object],
    issue_comments: list[object],
    inline_comments: list[object],
    runs: list[object],
    expected_head: str,
) -> list[str]:
    """Every reason the PR must not merge; an empty list means the gate is clean.

    Pure over its inputs so each block path is unit-testable without the network.
    """
    reasons: list[str] = []

    head = pr.get("head")
    head_sha = str(head.get("sha", "")) if isinstance(head, dict) else ""
    if head_sha != expected_head:
        reasons.append(f"head moved: {head_sha}")
    if pr.get("state") != "open":
        reasons.append("pull request is not open")
    if pr.get("draft"):
        reasons.append("pull request is still a draft")
    if pr.get("mergeable") is not True:
        reasons.append("pull request is not mergeable")
    if pr.get("mergeable_state") != "clean":
        reasons.append(f"merge state is {pr.get('mergeable_state')}")

    summary = greptile_summary(issue_comments)
    if summary is None:
        reasons.append("no Greptile summary found")
    else:
        summary_body = str(summary.get("body", ""))
        summary_updated = str(summary.get("updated_at", ""))
        if "Confidence Score: 5/5" not in summary_body:
            reasons.append("live Greptile score is not 5/5")
        if head_sha not in summary_body:
            reasons.append("live Greptile summary does not name the current head")
        newer = [
            item
            for item in issue_comments
            if isinstance(item, dict)
            and actor_login(item) == GREPTILE
            and item.get("id") != summary.get("id")
            and str(item.get("updated_at", item.get("created_at", ""))) > summary_updated
        ]
        if newer:
            reasons.append("a Greptile comment is newer than the live summary")

    findings = live_inline_findings(inline_comments, head_sha)
    if findings:
        reasons.append(f"Greptile has {len(findings)} inline finding(s)")

    if not runs:
        reasons.append("no check runs found")
    else:
        names = {str(run.get("name", "")) for run in runs if isinstance(run, dict)}
        missing = REQUIRED_CHECKS - names
        if missing:
            reasons.append(f"missing required checks: {sorted(missing)}")
        failing = [
            f"{run.get('name')}={run.get('status')}/{run.get('conclusion')}"
            for run in runs
            if isinstance(run, dict)
            and (run.get("status") != "completed" or run.get("conclusion") not in PASSING_CONCLUSIONS)
        ]
        if failing:
            reasons.append(f"non-passing checks: {', '.join(failing)}")

    return reasons


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

    issue_comments = get(f"{root}/issues/{args.pr}/comments?per_page=100", token)
    inline_comments = get(f"{root}/pulls/{args.pr}/comments?per_page=100", token)
    checks = get(f"{root}/commits/{head_sha}/check-runs?per_page=100", token)
    require(isinstance(issue_comments, list), "issue comments response was not a list")
    require(isinstance(inline_comments, list), "inline comments response was not a list")
    require(isinstance(checks, dict), "check-runs response was not an object")
    runs = checks.get("check_runs")
    require(isinstance(runs, list), "check-runs response had no run list")

    blockers = merge_blockers(pr, issue_comments, inline_comments, runs, args.expected_head)
    require(not blockers, "; ".join(blockers))

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

    names = {str(run.get("name", "")) for run in runs if isinstance(run, dict)}
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
