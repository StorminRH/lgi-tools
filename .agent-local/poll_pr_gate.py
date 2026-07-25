#!/usr/bin/env python3
"""Poll a PR until Greptile reviews the current head, CI finishes, or every bot
and check on the head goes quiet.

Examples:
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 greptile
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 checks
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 quiescent
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 review

The script prints only state changes, then the final details. `greptile` and
`checks` return 0 for a clean current-head Greptile 5/5 or green checks and 2
when a completed gate contains findings or failures. `quiescent` waits until the
head's reviewer set is complete and stable (so a late-registering bot is never
missed); it returns 0 once every reviewer is done — so fixes can be batched
before the next push — and 1 on timeout, leaving the pass/fail verdict to the
`greptile` gate and the merge helper.

`review` is the end-to-end watch: it waits for the same stability and then
evaluates the merge helper's own blocker predicate against that observation. A
ready result means the gate was clear at the last stable poll, not a promise about
the merge — the PR can change afterwards, and the helper re-validates live before
acting. It returns 0 when nothing blocked the merge at that observation, 2 with
the blocker list when the head is settled but something does, and 1 on timeout.
It inherits whichever reviewer is gate of record, and so covers inline findings
and the incremental reviewer's head-exact acknowledgement without duplicating
either rule. It never merges; that stays with the helper.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import time

from github_api import github_token, request
from merge_clean_pr import (
    CODERABBIT_CHECK,
    greptile_reviewed,
    merge_blockers,
    require,
    resolved_thread_roots,
)


GOOD_CONCLUSIONS = {"success", "neutral", "skipped"}
# CodeRabbit reports `success` even when it declined to review, putting the
# reason only in the status description. This substring is the one visible
# difference between "reviewed and clean" and "did not review".
RATE_LIMIT_HINT = "rate limit"


def coderabbit_rate_limited(status: dict[str, object]) -> bool:
    """True when CodeRabbit's commit status says it declined to review the head.

    A declined review is transient — the limit clears and its next pass runs — so
    the `review` gate keeps waiting instead of reporting a blocker the operator
    cannot act on. The merge helper still refuses meanwhile, because a green
    status with no review is exactly what it must never accept.
    """
    for item in status.get("statuses") or []:
        if not isinstance(item, dict) or str(item.get("context", "")) != CODERABBIT_CHECK:
            continue
        if RATE_LIMIT_HINT in str(item.get("description", "")).lower():
            return True
    return False


def get(path: str, token: str) -> object:
    body, _ = request("GET", path, token, None)
    return body


def greptile_state(repo: str, number: int, token: str) -> tuple[str, bool, dict[str, object] | None, list[dict[str, object]]]:
    pull = get(f"/repos/{repo}/pulls/{number}", token)
    assert isinstance(pull, dict)
    head_sha = str(pull["head"]["sha"])
    comments = get(f"/repos/{repo}/issues/{number}/comments?per_page=100", token)
    reviews = get(f"/repos/{repo}/pulls/{number}/comments?per_page=100", token)
    assert isinstance(comments, list) and isinstance(reviews, list)

    summaries = [
        comment
        for comment in comments
        if "greptile" in str(comment.get("user", {}).get("login", "")).lower()
        and "Greptile Summary" in str(comment.get("body", ""))
    ]
    summaries.sort(key=lambda comment: str(comment.get("updated_at", "")))
    summary = summaries[-1] if summaries else None
    current = bool(summary and head_sha in str(summary.get("body", "")))
    inline = [
        comment
        for comment in reviews
        if "greptile" in str(comment.get("user", {}).get("login", "")).lower()
        and comment.get("commit_id") == head_sha
    ]
    score = None
    if summary:
        match = re.search(r"Confidence Score:\s*(\d)/5", str(summary.get("body", "")))
        score = match.group(1) if match else "?"
    label = f"head={head_sha[:8]} current={current} score={score or 'pending'} findings={len(inline)}"
    clean = bool(current and score == "5" and not inline)
    return label, clean, summary, inline


def checks_state(repo: str, number: int, token: str) -> tuple[str, bool, bool, dict[str, object]]:
    pull = get(f"/repos/{repo}/pulls/{number}", token)
    assert isinstance(pull, dict)
    head_sha = str(pull["head"]["sha"])
    checks = get(f"/repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token)
    status = get(f"/repos/{repo}/commits/{head_sha}/status", token)
    assert isinstance(checks, dict) and isinstance(status, dict)
    runs = checks.get("check_runs", [])
    assert isinstance(runs, list)
    completed = bool(runs) and all(run.get("status") == "completed" for run in runs)
    runs_clean = completed and all(run.get("conclusion") in GOOD_CONCLUSIONS for run in runs)
    legacy_state = status.get("state")
    has_legacy_statuses = bool(status.get("statuses"))
    legacy_clean = not has_legacy_statuses or legacy_state == "success"
    clean = runs_clean and legacy_clean
    done = completed and (not has_legacy_statuses or legacy_state != "pending")
    detail = {
        "head": head_sha,
        "runs": [
            {"name": run.get("name"), "status": run.get("status"), "conclusion": run.get("conclusion")}
            for run in runs
        ],
        "legacy_state": legacy_state,
    }
    label = f"head={head_sha[:8]} completed={completed} clean={clean} legacy={legacy_state}"
    return label, done, clean, detail


def quiescence(runs: list[object], status: dict[str, object]) -> tuple[frozenset[str], bool]:
    """The reviewer set and whether every reviewer on the head has settled.

    Reviewers report either as check runs (Greptile, semgrep, CI) or as legacy
    commit statuses (some bots, e.g. CodeRabbit). Both must be accounted for, or
    a bot that has not finished reads as quiet. Pure over its inputs so the
    settled rule is unit-testable.
    """
    run_names = frozenset(
        str(run.get("name", "")) for run in runs if isinstance(run, dict)
    )
    status_list = status.get("statuses") if isinstance(status, dict) else []
    status_names = frozenset(
        str(item.get("context", ""))
        for item in (status_list or [])
        if isinstance(item, dict)
    )
    runs_completed = bool(runs) and all(
        run.get("status") == "completed" for run in runs if isinstance(run, dict)
    )
    legacy_pending = bool(status_names) and status.get("state") == "pending"
    settled = runs_completed and not legacy_pending
    return run_names | status_names, settled


def stable_key(head: str, names: frozenset[str], settled: bool) -> tuple[str, frozenset[str]] | None:
    """The head-scoped stability key for a settled, non-empty reviewer set.

    Returns None until the set is settled and non-empty, so the caller treats
    the head as quiet only after the same (head, reviewers) holds for two polls.
    Keying on the head as well as the names resets the wait when a new push
    lands, even if its reviewer set matches the previous head's.
    """
    return (head, names) if settled and names else None


def quiescent_state(repo: str, number: int, token: str) -> tuple[str, frozenset[str], bool, dict[str, object]]:
    pull = get(f"/repos/{repo}/pulls/{number}", token)
    assert isinstance(pull, dict)
    head_sha = str(pull["head"]["sha"])
    checks = get(f"/repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token)
    status = get(f"/repos/{repo}/commits/{head_sha}/status", token)
    assert isinstance(checks, dict) and isinstance(status, dict)
    runs = checks.get("check_runs", [])
    assert isinstance(runs, list)
    names, settled = quiescence(runs, status)
    detail = {
        "head": head_sha,
        "runs": [
            {"name": run.get("name"), "status": run.get("status"), "conclusion": run.get("conclusion")}
            for run in runs
        ],
        "legacy_state": status.get("state"),
    }
    label = f"head={head_sha[:8]} reviewers={len(names)} settled={settled}"
    return label, names, settled, detail


def review_key(
    head: str, names: frozenset[str], blockers: list[str], settled: bool
) -> tuple[str, frozenset[str], frozenset[str]] | None:
    """Stability key for the review gate, or None while the head is still moving.

    Keyed on the reviewer set as well as the head, like `stable_key`, so a
    late-registering bot resets the wait rather than reading as "no review on this
    head". Unlike `stable_key` it also carries the blocker set and tolerates an
    empty one, because an empty blocker list is the success case here rather than
    an absence of data.
    """
    if not settled or not names:
        return None
    return (head, names, frozenset(blockers))


def review_state(
    repo: str, number: int, token: str
) -> tuple[str, tuple[str, frozenset[str], frozenset[str]] | None, list[str], dict[str, object]]:
    """Evaluate the merge gate's own blocker predicate against the live head.

    Deliberately calls `merge_clean_pr.merge_blockers` rather than re-deriving
    "is the reviewer satisfied": the poll and the merge would otherwise be two
    representations of one rule and could drift, which is exactly how a poll
    comes to report ready for a head the merge helper then refuses. Because it
    reuses that predicate, it inherits whichever reviewer is gate of record and
    covers both inline findings and the incremental reviewer's head-exact
    acknowledgement without knowing anything about either.

    The verdict describes one observation, not the merge: a reviewer can post a
    finding moments later. This only reports; the helper re-validates live.
    """
    # Shape-validated with `require`, like the merge helper: a bare `assert`
    # vanishes under `python -O` and reports nothing actionable when it fires.
    pull = get(f"/repos/{repo}/pulls/{number}", token)
    require(isinstance(pull, dict), "pull request response was not an object")
    head = pull.get("head")
    require(isinstance(head, dict), "pull request has no head data")
    head_sha = str(head.get("sha", ""))
    issue_comments = get(f"/repos/{repo}/issues/{number}/comments?per_page=100", token)
    inline_comments = get(f"/repos/{repo}/pulls/{number}/comments?per_page=100", token)
    checks = get(f"/repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token)
    status = get(f"/repos/{repo}/commits/{head_sha}/status", token)
    require(isinstance(issue_comments, list), "issue comments response was not a list")
    require(isinstance(inline_comments, list), "inline comments response was not a list")
    require(isinstance(checks, dict), "check-runs response was not an object")
    require(isinstance(status, dict), "commit status response was not an object")
    runs = checks.get("check_runs", [])
    require(isinstance(runs, list), "check-runs response had no run list")

    names, settled = quiescence(runs, status)
    fallback = not greptile_reviewed(issue_comments, runs)
    resolved_roots: frozenset[int] = frozenset()
    reviews: list[object] = []
    if fallback:
        # Thread resolution and review records only matter on the fallback path,
        # and both cost an extra request, so they are fetched only when needed.
        resolved_roots = resolved_thread_roots(number, token, repo)
        reviews_body = get(f"/repos/{repo}/pulls/{number}/reviews?per_page=100", token)
        require(isinstance(reviews_body, list), "reviews response was not a list")
        reviews = reviews_body

    blockers = merge_blockers(
        pull, issue_comments, inline_comments, runs, head_sha, resolved_roots, reviews
    )
    gate = "coderabbit" if fallback else "greptile"
    # A declined review is not a stable state: keep waiting rather than reporting
    # a blocker whose only remedy is time.
    limited = fallback and coderabbit_rate_limited(status)
    label = (
        f"head={head_sha[:8]} gate={gate} settled={settled} "
        f"blockers={len(blockers)}{' rate-limited' if limited else ''}"
    )
    detail = {"head": head_sha, "gate": gate, "blockers": blockers, "rateLimited": limited}
    key = None if limited else review_key(head_sha, names, blockers, settled)
    return label, key, blockers, detail


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("number", type=int)
    parser.add_argument("gate", choices=("greptile", "checks", "quiescent", "review"))
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()

    token = github_token()
    deadline = time.monotonic() + args.timeout
    last_label = None
    stable_marker: tuple[str, frozenset[str]] | None = None
    review_marker: tuple[str, frozenset[str], frozenset[str]] | None = None
    while time.monotonic() < deadline:
        now = dt.datetime.now().astimezone().strftime("%H:%M:%S")
        if args.gate == "greptile":
            label, clean, summary, inline = greptile_state(args.repo, args.number, token)
            if label != last_label:
                print(f"[{now}] {label}", flush=True)
                last_label = label
            current = "current=True" in label
            if current:
                print("\nGREPTILE SUMMARY\n")
                print(summary.get("body", "") if summary else "")
                if inline:
                    print("\nCURRENT-HEAD INLINE FINDINGS\n")
                    for finding in inline:
                        print(f"{finding.get('path')}:{finding.get('line')}\n{finding.get('body')}\n")
                return 0 if clean else 2
        elif args.gate == "review":
            label, key, blockers, detail = review_state(args.repo, args.number, token)
            if label != last_label:
                print(f"[{now}] {label}", flush=True)
                last_label = label
            # Same one-interval stability rule as `quiescent`: a bot that has not
            # registered its run yet must not read as "no review on this head".
            if key is not None and key == review_marker:
                print(detail)
                if not blockers and detail.get("gate") == "coderabbit":
                    # Greptile's total absence is what selects the fallback, and a
                    # merely slow Greptile looks identical to an exhausted one at
                    # this moment. Say so, so a ready verdict is never read as
                    # "the primary reviewer passed it".
                    print(
                        "\nNOTE: ready under the CodeRabbit fallback — Greptile "
                        "posted no summary and no check. If Greptile was only "
                        "slow, re-run before merging."
                    )
                if blockers:
                    print("\nBLOCKERS\n")
                    for reason in blockers:
                        print(f"- {reason}")
                return 0 if not blockers else 2
            review_marker = key
        elif args.gate == "quiescent":
            label, names, settled, detail = quiescent_state(args.repo, args.number, token)
            if label != last_label:
                print(f"[{now}] {label}", flush=True)
                last_label = label
            # Require the settled (head, reviewer set) to hold for one interval,
            # so a bot that has not yet registered its run or status cannot read
            # as done and a fresh push restarts the wait.
            key = stable_key(str(detail.get("head", "")), names, settled)
            if key is not None and key == stable_marker:
                print(detail)
                return 0
            stable_marker = key
        else:
            label, done, clean, detail = checks_state(args.repo, args.number, token)
            if label != last_label:
                print(f"[{now}] {label}", flush=True)
                last_label = label
            if done:
                print(detail)
                return 0 if clean else 2
        time.sleep(args.interval)

    print(f"timed out after {args.timeout} seconds")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
