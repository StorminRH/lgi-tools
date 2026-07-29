#!/usr/bin/env python3
"""Revalidate a clean LGI.tools PR and squash-merge it through GitHub REST.

The script uses the credential already held by git, prints no credential data,
and refuses to merge unless the live review gate, CI, mergeability, and expected
head SHA all satisfy the repository close-out gate.

Every reviewer that took part in a PR is part of its gate. Greptile and
CodeRabbit are peers here, not a gate of record and a fallback: whichever of
them participated must be satisfied, and neither can be waived by pointing at
the other. A reviewer that never appeared — no comment, no review, no check,
which is what an exhausted quota looks like — gates nothing, so one reviewer
being out of credit leaves the other deciding the merge alone rather than
stalling it. If neither appeared there is no review and nothing merges.

Both reviewers count a finding as live until its review thread is resolved.
Resolution is the only honest signal for either: CodeRabbit pins a comment to
the commit it was first anchored to forever, and GitHub re-anchors a Greptile
comment to each new head whenever its line survives the fix — including
comments Greptile itself already marked addressed. Neither commit id says
anything about whether the finding still stands.

Someone must have read the exact code being merged, so at least one
participating reviewer has to carry head-exact evidence: for Greptile a live
summary naming the head, for CodeRabbit a head-pinned review or its own
`Addressed in commit <sha>` marker. Requiring it of every participant instead
would make a rate-limited pass unmergeable no matter how many other reviewers
had read the head.

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
# The base set is everything required when Greptile is not on the PR. CodeRabbit
# adds nothing to it: it reports as a commit status rather than a check run, and
# that status can pass while saying "Review rate limited", so no check name can
# stand for its participation. Its review record does that instead.
BASE_REQUIRED_CHECKS = {"semgrep-cloud-platform/scan", "test"}
REQUIRED_CHECKS = BASE_REQUIRED_CHECKS | {GREPTILE_CHECK}
PASSING_CONCLUSIONS = {"success", "neutral", "skipped"}
# CodeRabbit's machine-emitted verification marker, appended to a finding as its
# own trailing line when an incremental pass confirms the commit that fixed it.
# Its sha is abbreviated, so it is matched as a prefix of the full head sha.
#
# Anchored to a whole line on purpose. An unanchored search would also match the
# phrase quoted mid-sentence or inside a fenced code block — and this repository's
# own source and tests contain that literal string, so a review of this very file
# could otherwise quote a sha back and mint head evidence no pass produced. The
# optional leading run covers the emoji CodeRabbit prefixes the line with.
MIN_ABBREVIATED_SHA = 7
ADDRESSED_MARKER = re.compile(
    r"^[^\w\n]{0,4}\s*Addressed in commit\s+`?"
    rf"([0-9a-fA-F]{{{MIN_ABBREVIATED_SHA},40}})`?\s*$",
    re.MULTILINE,
)


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


def resolved_thread_roots(
    pr_number: int, token: str, repo: str | None = None
) -> frozenset[int]:
    """Database ids of the first comment in every resolved review thread.

    Review-thread resolution is GraphQL-only; REST comment payloads carry no
    resolved flag. Any transport or shape failure propagates so the gate fails
    closed rather than treating unknown threads as resolved.

    `repo` accepts an `owner/name` pair for callers that address a repository by
    argument rather than by this module's constants. Without it, a caller polling
    another repository would read resolutions from this one and could treat its
    unresolved findings as resolved — the one way this function can fail open.
    """
    owner, name = (repo.split("/", 1) if repo else (OWNER, REPO))
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
                    "owner": owner,
                    "repo": name,
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
    inline_comments: list[object],
    resolved_roots: frozenset[int],
) -> list[dict[str, object]]:
    """Greptile inline findings that are not resolved, at any anchor commit.

    Deliberately NOT filtered to the current head. That filter was believed to
    exclude addressed findings, on the theory that Greptile re-anchors only a
    still-live one — but ``commit_id`` is GitHub's, not Greptile's: it follows
    any comment whose anchor line survives the fix, including one Greptile has
    already marked addressed and resolved. Observed on PR #324, where all four
    Greptile threads were resolved and its live summary scored 5/5 while two
    re-anchored comments still read as head-live and refused the merge.

    Resolution is the honest signal, and it is the same bar the CodeRabbit path
    enforces. Only thread roots count; a bot reply hangs off a root and is not a
    separate finding.
    """
    return [
        item
        for item in inline_comments
        if isinstance(item, dict)
        and actor_login(item) == GREPTILE
        and item.get("in_reply_to_id") is None
        and int(item.get("id", 0)) not in resolved_roots
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

    Deliberately NOT filtered to the current head. CodeRabbit's comment keeps
    the commit it was first anchored to forever, so filtering by head would drop
    every CodeRabbit finding the moment any commit landed after it.
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
    quota looks like, and is the only condition that drops Greptile out of the
    gate and leaves the remaining reviewer deciding alone.
    """
    if greptile_summary(issue_comments) is not None:
        return True
    return any(
        isinstance(run, dict) and str(run.get("name", "")) == GREPTILE_CHECK
        for run in runs
    )


def coderabbit_reviewed(
    inline_comments: list[object], reviews: list[object]
) -> bool:
    """True when CodeRabbit took part in this PR at all.

    Read from the review record rather than a check, because CodeRabbit reports
    as a commit status that this gate never fetches — and that status reports
    success even when its body says the review was rate limited, so it is not
    evidence of participation anyway.
    """
    return any(
        isinstance(item, dict) and actor_login(item) == CODERABBIT
        for item in [*inline_comments, *reviews]
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


def greptile_head_evidence(
    issue_comments: list[object], head_sha: str
) -> str | None:
    """None when Greptile's live verdict covers this exact head, else the reason.

    Greptile re-reviews every head and pins its summary to the one it read, so
    the summary naming the head is its own statement that it read that commit.
    A newer Greptile comment than the summary means a pass is still landing and
    the summary is not yet the last word.
    """
    summary = greptile_summary(issue_comments)
    if summary is None:
        return "no Greptile summary found"
    summary_updated = str(summary.get("updated_at", ""))
    if any(
        isinstance(item, dict)
        and actor_login(item) == GREPTILE
        and item.get("id") != summary.get("id")
        and str(item.get("updated_at", item.get("created_at", ""))) > summary_updated
        for item in issue_comments
    ):
        return "a Greptile comment is newer than the live summary"
    if head_sha not in str(summary.get("body", "")):
        return "live Greptile summary does not name the current head"
    return None


def greptile_blockers(
    issue_comments: list[object],
    inline_comments: list[object],
    resolved_roots: frozenset[int],
) -> list[str]:
    """What a participating Greptile must satisfy, independent of the head.

    Head-exact evidence is deliberately not checked here: it is satisfied
    collectively in `merge_blockers`, so a reviewer that skipped this head does
    not veto one that read it.
    """
    reasons: list[str] = []
    summary = greptile_summary(issue_comments)
    if summary is None:
        # A reviewer that appeared owes a verdict; silence is not approval.
        reasons.append("no Greptile summary found")
    elif "Confidence Score: 5/5" not in str(summary.get("body", "")):
        reasons.append("live Greptile score is not 5/5")

    findings = live_inline_findings(inline_comments, resolved_roots)
    if findings:
        reasons.append(f"Greptile has {len(findings)} unresolved inline finding(s)")
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
    head = head_sha.lower()
    for item in inline_comments:
        if not isinstance(item, dict) or actor_login(item) != CODERABBIT:
            continue
        if item.get("in_reply_to_id") is not None:
            continue
        # The pattern already enforces the minimum abbreviation length.
        for sha in ADDRESSED_MARKER.findall(str(item.get("body", ""))):
            if head.startswith(sha.lower()):
                return True
    return False


def coderabbit_reviewed_head(
    reviews: list[object],
    head_sha: str,
    inline_comments: list[object] | None = None,
) -> bool:
    """True when CodeRabbit demonstrably examined the exact current head.

    This is CodeRabbit's proof that a review actually happened. Its commit
    status reports `success` even when its body says "Review rate limited", so
    the status alone would let an unreviewed head merge.

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
    inline_comments: list[object],
    resolved_roots: frozenset[int],
) -> list[str]:
    """What a participating CodeRabbit must satisfy, independent of the head.

    Head-exact evidence is checked collectively in `merge_blockers`, for the
    same reason as the Greptile path: a rate-limited pass leaves the reviewer
    that did read the head to carry that requirement.
    """
    findings = live_coderabbit_findings(inline_comments, resolved_roots)
    if not findings:
        return []
    return [f"CodeRabbit has {len(findings)} unresolved inline finding(s)"]


def review_blockers(
    issue_comments: list[object],
    inline_comments: list[object],
    runs: list[object],
    reviews: list[object],
    head_sha: str,
    resolved_roots: frozenset[int],
) -> list[str]:
    """Every review reason the PR must not merge, across all reviewers.

    Each reviewer that appeared must be satisfied on its own terms; one that
    never appeared gates nothing, so an exhausted quota narrows the gate to the
    reviewers that are actually there instead of stalling the merge. Head-exact
    evidence is required of the set rather than of each member: one reviewer
    demonstrably read this head, and every participant's findings are resolved.
    """
    reasons: list[str] = []
    head_read = False
    unread: list[str] = []

    if greptile_reviewed(issue_comments, runs):
        reasons.extend(greptile_blockers(issue_comments, inline_comments, resolved_roots))
        evidence = greptile_head_evidence(issue_comments, head_sha)
        if evidence is None:
            head_read = True
        else:
            unread.append(evidence)
    else:
        unread.append("no Greptile review on the current head")

    if coderabbit_reviewed(inline_comments, reviews):
        reasons.extend(coderabbit_blockers(inline_comments, resolved_roots))
        if coderabbit_reviewed_head(reviews, head_sha, inline_comments):
            head_read = True
        else:
            unread.append("no CodeRabbit review on the current head")
    else:
        unread.append("no CodeRabbit review on the current head")

    if not head_read:
        reasons.append("no reviewer read the current head: " + "; ".join(unread))
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

    reviews = reviews or []
    reasons.extend(
        review_blockers(issue_comments, inline_comments, runs, reviews, head_sha, resolved_roots)
    )
    required = (
        REQUIRED_CHECKS
        if greptile_reviewed(issue_comments, runs)
        else BASE_REQUIRED_CHECKS
    )

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

    # Both reviewers are keyed on thread resolution and on their own review
    # records, so neither read is optional any more.
    resolved_roots = resolved_thread_roots(args.pr, token)
    reviews = get(f"{root}/pulls/{args.pr}/reviews?per_page=100", token)
    require(isinstance(reviews, list), "reviews response was not a list")

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
    gated = [
        name
        for name, present in (
            ("greptile", greptile_reviewed(issue_comments, runs)),
            ("coderabbit", coderabbit_reviewed(inline_comments, reviews)),
        )
        if present
    ]
    print(json.dumps({
        "pr": args.pr,
        "head": head_sha,
        "review_gate": "+".join(gated),
        "review_result": "every participating reviewer satisfied, zero unresolved findings",
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
