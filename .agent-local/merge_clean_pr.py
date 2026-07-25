#!/usr/bin/env python3
"""Revalidate a clean LGI.tools PR and squash-merge it through GitHub REST.

The script uses the credential already held by git, prints no credential data,
and refuses to merge unless the live review gate, CI, mergeability, and expected
head SHA all satisfy the repository close-out gate.

Greptile is the gate of record. CodeRabbit is a fallback, not an alternative:
it gates only when Greptile did not review this PR at all — no summary comment
and no `Greptile Review` check — which is what a Greptile quota exhaustion looks
like. Whenever Greptile did review, its summary and inline findings decide the
merge and CodeRabbit stays advisory, so a Greptile finding can never be waived
by pointing at a green CodeRabbit.

The fallback counts a CodeRabbit finding as live until its review thread is
resolved, so an addressed or withdrawn finding must be resolved on the PR before
the merge is allowed.

Usage:
  python3 .agent-local/merge_clean_pr.py 228 <expected-head-sha>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse

from github_api import github_token, request


OWNER = "StorminRH"
REPO = "lgi-tools"
GREPTILE = "greptile-apps[bot]"
CODERABBIT = "coderabbitai[bot]"
GREPTILE_CHECK = "Greptile Review"
CODERABBIT_CHECK = "CodeRabbit"
BASE_REQUIRED_CHECKS = {"semgrep-cloud-platform/scan", "test"}
REQUIRED_CHECKS = BASE_REQUIRED_CHECKS | {GREPTILE_CHECK}
# CodeRabbit reports as a commit status rather than a check run, and its status
# can pass while saying "Review rate limited". The fallback therefore proves the
# review happened from the review record itself, not from a named check.
FALLBACK_REQUIRED_CHECKS = BASE_REQUIRED_CHECKS
PASSING_CONCLUSIONS = {"success", "neutral", "skipped"}
# CodeRabbit's machine-emitted verification marker, appended to a finding when an
# incremental pass confirms the commit that fixed it. Its sha is abbreviated, so
# it is matched as a prefix of the full head sha.
ADDRESSED_MARKER = re.compile(r"Addressed in commit\s+`?([0-9a-fA-F]{7,40})`?")
MIN_ABBREVIATED_SHA = 7


RESOLVED_THREADS_QUERY = """
query($owner:String!,$repo:String!,$pr:Int!,$cursor:String){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:100, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ isResolved comments(first:1){ nodes{ databaseId } } }
      }
    }
  }
}
"""


def get(path: str, token: str) -> object:
    body, _ = request("GET", path, token, None)
    return body


def resolved_thread_roots(pr_number: int, token: str) -> frozenset[int]:
    """Database ids of the first comment in every resolved review thread.

    Review-thread resolution is GraphQL-only; REST comment payloads carry no
    resolved flag. Any transport or shape failure propagates so the gate fails
    closed rather than treating unknown threads as resolved.
    """
    resolved: set[int] = set()
    cursor: str | None = None
    while True:
        body, _ = request(
            "POST",
            "/graphql",
            token,
            {
                "query": RESOLVED_THREADS_QUERY,
                "variables": {
                    "owner": OWNER,
                    "repo": REPO,
                    "pr": pr_number,
                    "cursor": cursor,
                },
            },
        )
        require(isinstance(body, dict), "GraphQL response was not an object")
        require("errors" not in body, f"GraphQL reported errors: {body.get('errors')}")
        threads = (
            body.get("data", {})
            .get("repository", {})
            .get("pullRequest", {})
            .get("reviewThreads", {})
        )
        require(isinstance(threads, dict), "GraphQL response had no reviewThreads")
        for node in threads.get("nodes", []):
            if not isinstance(node, dict) or not node.get("isResolved"):
                continue
            comments = node.get("comments", {}).get("nodes", [])
            if comments and isinstance(comments[0], dict):
                database_id = comments[0].get("databaseId")
                if isinstance(database_id, int):
                    resolved.add(database_id)
        page = threads.get("pageInfo", {})
        if not isinstance(page, dict) or not page.get("hasNextPage"):
            return frozenset(resolved)
        cursor = str(page.get("endCursor"))


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


def live_coderabbit_findings(
    inline_comments: list[object],
    resolved_roots: frozenset[int],
) -> list[dict[str, object]]:
    """CodeRabbit inline findings that are not resolved, at any anchor commit.

    Only thread roots count: CodeRabbit's replies (including its own "addressed"
    and "withdrawing" notes) hang off a root and are not separate findings. A
    root stops blocking once its review thread is resolved on the PR, which is
    the same "no finding left standing" bar the Greptile path enforces.

    Deliberately NOT filtered to the current head, unlike `live_inline_findings`.
    That filter is correct for Greptile, which re-anchors a still-live finding to
    each new head, and silently wrong for CodeRabbit, whose comment keeps the
    commit it was first anchored to forever. Filtering by head would drop every
    CodeRabbit finding the moment any commit landed after it, so resolution is
    the only honest signal here.
    """
    return [
        item
        for item in inline_comments
        if isinstance(item, dict)
        and actor_login(item) == CODERABBIT
        and item.get("in_reply_to_id") is None
        and int(item.get("id", 0)) not in resolved_roots
    ]


def greptile_reviewed(issue_comments: list[object], runs: list[object]) -> bool:
    """True when Greptile took part in this PR at all.

    Absence of both its summary and its check is what an exhausted Greptile
    quota looks like, and is the only condition that hands the gate to the
    CodeRabbit fallback.
    """
    if greptile_summary(issue_comments) is not None:
        return True
    return any(
        isinstance(run, dict) and str(run.get("name", "")) == GREPTILE_CHECK
        for run in runs
    )


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


def greptile_blockers(
    issue_comments: list[object],
    inline_comments: list[object],
    head_sha: str,
) -> list[str]:
    """Gate-of-record reasons: the live Greptile summary and its inline findings."""
    reasons: list[str] = []
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
    return reasons


def coderabbit_acknowledged_head(inline_comments: list[object], head_sha: str) -> bool:
    """True when CodeRabbit's own verification marker names the exact current head.

    CodeRabbit is an incremental reviewer: it does not re-review a commit it has
    already seen, and it does not file a fresh review object for a fix push.
    Instead its incremental pass edits the existing finding in place, appending
    its machine-emitted marker (``Addressed in commit <abbreviated sha>``) and
    resolving the thread. That marker is the pass's own statement that it read
    that exact commit, so it is head-exact review evidence even though the
    comment's ``commit_id`` stays pinned to the commit the finding was anchored
    to and never moves.

    Scoped to inline finding roots on purpose. The marker is only ever written by
    editing a finding, so widening the scan to issue comments would add nothing
    real while opening a prompt-echo channel: CodeRabbit's conversational replies
    are authored by the same bot, so a reply induced to repeat the phrase would
    otherwise mint review evidence no pass produced.

    Keyed to the marker rather than to a bare sha for the same reason — a bare
    sha may just be the bot quoting a request back. A rate-limited pass emits no
    marker, so the "review rate limited" hole this gate exists to close stays
    closed.
    """
    if not head_sha:
        return False
    for item in inline_comments:
        if not isinstance(item, dict) or actor_login(item) != CODERABBIT:
            continue
        if item.get("in_reply_to_id") is not None:
            continue
        for sha in ADDRESSED_MARKER.findall(str(item.get("body", ""))):
            if len(sha) >= MIN_ABBREVIATED_SHA and head_sha.startswith(sha.lower()):
                return True
    return False


def coderabbit_reviewed_head(
    reviews: list[object],
    head_sha: str,
    inline_comments: list[object] | None = None,
) -> bool:
    """True when CodeRabbit demonstrably examined the exact current head.

    This is the fallback's proof that a review actually happened. CodeRabbit's
    commit status reports `success` even when its body says "Review rate
    limited", so the status alone would let an unreviewed head merge.

    Two forms of head-exact evidence are accepted, matching how CodeRabbit
    actually reports. A review object pinned to the head covers its first pass
    over a PR. An incremental pass over a later push covers the rest: it files no
    new review object, so its own ``Addressed in commit <sha>`` marker naming the
    head is the equivalent proof (see ``coderabbit_acknowledged_head``). Without
    the second form the gate is unsatisfiable for any PR that needed a fix round,
    which is not a stricter gate — it is a stuck one.
    """
    if any(
        isinstance(item, dict)
        and actor_login(item) == CODERABBIT
        and str(item.get("commit_id", "")) == head_sha
        for item in reviews
    ):
        return True
    return coderabbit_acknowledged_head(inline_comments or [], head_sha)


def coderabbit_blockers(
    reviews: list[object],
    inline_comments: list[object],
    head_sha: str,
    resolved_roots: frozenset[int],
) -> list[str]:
    """Fallback reasons, used only when Greptile did not review this PR."""
    reasons: list[str] = []
    if not coderabbit_reviewed_head(reviews, head_sha, inline_comments):
        reasons.append("no CodeRabbit review on the current head")
    findings = live_coderabbit_findings(inline_comments, resolved_roots)
    if findings:
        reasons.append(f"CodeRabbit has {len(findings)} unresolved inline finding(s)")
    return reasons


def merge_blockers(
    pr: dict[str, object],
    issue_comments: list[object],
    inline_comments: list[object],
    runs: list[object],
    expected_head: str,
    resolved_roots: frozenset[int] = frozenset(),
    reviews: list[object] | None = None,
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

    if greptile_reviewed(issue_comments, runs):
        reasons.extend(greptile_blockers(issue_comments, inline_comments, head_sha))
        required = REQUIRED_CHECKS
    else:
        reasons.extend(
            coderabbit_blockers(reviews or [], inline_comments, head_sha, resolved_roots)
        )
        required = FALLBACK_REQUIRED_CHECKS

    if not runs:
        reasons.append("no check runs found")
    else:
        names = {str(run.get("name", "")) for run in runs if isinstance(run, dict)}
        missing = required - names
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

    fallback = not greptile_reviewed(issue_comments, runs)
    resolved_roots: frozenset[int] = frozenset()
    reviews: list[object] = []
    if fallback:
        resolved_roots = resolved_thread_roots(args.pr, token)
        reviews_body = get(f"{root}/pulls/{args.pr}/reviews?per_page=100", token)
        require(isinstance(reviews_body, list), "reviews response was not a list")
        reviews = reviews_body

    blockers = merge_blockers(
        pr,
        issue_comments,
        inline_comments,
        runs,
        args.expected_head,
        resolved_roots,
        reviews,
    )
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
        "review_gate": "coderabbit (greptile did not review)" if fallback else "greptile",
        "review_result": (
            "zero unresolved findings" if fallback else "5/5, zero findings"
        ),
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
