#!/usr/bin/env python3
"""Poll a PR until Greptile reviews the current head, CI finishes, or every bot
and check on the head goes quiet.

Examples:
  python3 tools/cli.py delivery poll-pr-gate StorminRH/lgi-tools 228 greptile
  python3 tools/cli.py delivery poll-pr-gate StorminRH/lgi-tools 228 checks
  python3 tools/cli.py delivery poll-pr-gate StorminRH/lgi-tools 228 quiescent
  python3 tools/cli.py delivery poll-pr-gate StorminRH/lgi-tools 228 review

The script prints only state changes, then the final details. `greptile` and
`checks` return 0 for a clean current-head Greptile 5/5 or green checks and 2
when a completed gate contains findings or failures. `quiescent` waits until the
head's reviewer set is complete and stable (so a late-registering bot is never
missed); it returns 0 once every reviewer is done — so fixes can be batched
before the next push — and 1 on timeout, leaving the pass/fail verdict to the
`greptile` gate and the merge helper. Cursor Bugbot remains non-gating, but its
provider-specific neutral/skipped conclusion is reported as `cursor=comments`
so its findings are included in that batched review.

`review` is the end-to-end watch: it waits for the same stability and then
evaluates the merge helper's own blocker predicate against that observation. A
ready result means the gate was clear at the last stable poll, not a promise about
the merge — the PR can change afterwards, and the helper re-validates live before
acting. It returns 0 when nothing blocked the merge at that observation, 2 with
the blocker list when the head is settled but something does, and 1 on timeout.
It inherits whichever reviewers actually gate the PR, and so covers every
participant's unresolved findings and the incremental reviewer's head-exact
acknowledgement without duplicating either rule. It never merges; that stays
with the helper.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import time

from tools.delivery.github_api import get_all, github_token, request
from tools.delivery.merge_clean_pr import (
    CODERABBIT_CHECK,
    coderabbit_reviewed,
    coderabbit_reviewed_head,
    greptile_head_evidence,
    greptile_reviewed,
    live_inline_findings,
    merge_blockers,
    require,
    resolved_thread_roots,
)


GOOD_CONCLUSIONS = {"success", "neutral", "skipped"}
# CodeRabbit reports `success` even when it declined to review, putting the
# reason only in the status description. This substring is the one visible
# difference between "reviewed and clean" and "did not review".
RATE_LIMIT_HINT = "rate limit"
CURSOR_BUGBOT_CHECK = "Cursor Bugbot"
CURSOR_COMMENT_CONCLUSIONS = {"neutral", "skipped"}


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


def coderabbit_waiting_for_review(
    status: dict[str, object],
    reviews: list[object],
    head_sha: str,
    inline_comments: list[object],
) -> bool:
    """True when a rate-limited status still lacks exact-head review evidence.

    CodeRabbit's legacy status can remain rate-limited after its incremental pass
    acknowledges the current head in an addressed-finding marker. Match the merge
    helper's evidence rule so stale status text cannot hang the watch.
    """
    return coderabbit_rate_limited(status) and not coderabbit_reviewed_head(
        reviews, head_sha, inline_comments
    )


def cursor_bugbot_signal(runs: list[object]) -> str:
    """Summarize Cursor Bugbot for review collection without making it a gate.

    Cursor reports a clean review as `success`. A review with inline findings
    arrives as GitHub conclusion `neutral`, which `gh pr checks` displays as
    "skipping"; tolerate a literal `skipped` conclusion as the same provider
    signal. Other checks keep GitHub's ordinary conclusion semantics.
    """
    matches = [
        run
        for run in runs
        if isinstance(run, dict)
        and str(run.get("name", "")).lower() == CURSOR_BUGBOT_CHECK.lower()
    ]
    if not matches:
        return "unregistered"
    if any(run.get("status") != "completed" for run in matches):
        return "pending"
    conclusions = {
        str(run.get("conclusion", "")).lower()
        for run in matches
    }
    if conclusions & CURSOR_COMMENT_CONCLUSIONS:
        return "comments"
    if conclusions == {"success"}:
        return "clean"
    return "attention"


def get(path: str, token: str) -> object:
    body, _ = request("GET", path, token, None)
    return body


def greptile_state(repo: str, number: int, token: str) -> tuple[str, bool, dict[str, object] | None, list[dict[str, object]]]:
    pull = get(f"/repos/{repo}/pulls/{number}", token)
    assert isinstance(pull, dict)
    head_sha = str(pull["head"]["sha"])
    # Read to the last page: the merge helper's predicate is imported, so this
    # watch must see the same complete record set the gate will decide on.
    comments = get_all(f"/repos/{repo}/issues/{number}/comments?per_page=100", token)
    reviews = get_all(f"/repos/{repo}/pulls/{number}/comments?per_page=100", token)

    summaries = [
        comment
        for comment in comments
        if "greptile" in str(comment.get("user", {}).get("login", "")).lower()
        and "Greptile Summary" in str(comment.get("body", ""))
    ]
    summaries.sort(key=lambda comment: str(comment.get("updated_at", "")))
    summary = summaries[-1] if summaries else None
    current = bool(summary and head_sha in str(summary.get("body", "")))
    # Resolution, not anchor commit — the merge helper's rule, imported rather
    # than restated so this watch cannot report a finding the helper waives, or
    # miss one it refuses.
    inline = live_inline_findings(reviews, resolved_thread_roots(number, token, repo))
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
    runs = get_all(
        f"/repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token, key="check_runs"
    )
    status = get(f"/repos/{repo}/commits/{head_sha}/status", token)
    assert isinstance(status, dict)
    completed = bool(runs) and all(run.get("status") == "completed" for run in runs)
    runs_clean = completed and all(run.get("conclusion") in GOOD_CONCLUSIONS for run in runs)
    legacy_state = status.get("state")
    has_legacy_statuses = bool(status.get("statuses"))
    legacy_clean = not has_legacy_statuses or legacy_state == "success"
    clean = runs_clean and legacy_clean
    done = completed and (not has_legacy_statuses or legacy_state != "pending")
    cursor_signal = cursor_bugbot_signal(runs)
    detail = {
        "head": head_sha,
        "runs": [
            {"name": run.get("name"), "status": run.get("status"), "conclusion": run.get("conclusion")}
            for run in runs
        ],
        "legacy_state": legacy_state,
        "reviewSignals": {"cursorBugbot": cursor_signal},
    }
    label = (
        f"head={head_sha[:8]} completed={completed} clean={clean} "
        f"legacy={legacy_state} cursor={cursor_signal}"
    )
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
    runs = get_all(
        f"/repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token, key="check_runs"
    )
    status = get(f"/repos/{repo}/commits/{head_sha}/status", token)
    assert isinstance(status, dict)
    names, settled = quiescence(runs, status)
    cursor_signal = cursor_bugbot_signal(runs)
    detail = {
        "head": head_sha,
        "runs": [
            {"name": run.get("name"), "status": run.get("status"), "conclusion": run.get("conclusion")}
            for run in runs
        ],
        "legacy_state": status.get("state"),
        "reviewSignals": {"cursorBugbot": cursor_signal},
    }
    label = (
        f"head={head_sha[:8]} reviewers={len(names)} settled={settled} "
        f"cursor={cursor_signal}"
    )
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
    issue_comments = get_all(f"/repos/{repo}/issues/{number}/comments?per_page=100", token)
    inline_comments = get_all(f"/repos/{repo}/pulls/{number}/comments?per_page=100", token)
    runs = get_all(
        f"/repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token, key="check_runs"
    )
    status = get(f"/repos/{repo}/commits/{head_sha}/status", token)
    require(isinstance(status, dict), "commit status response was not an object")

    names, settled = quiescence(runs, status)
    # Both reviewers are keyed on thread resolution and on their own review
    # records, so neither read is optional on any path.
    resolved_roots = resolved_thread_roots(number, token, repo)
    reviews = get_all(f"/repos/{repo}/pulls/{number}/reviews?per_page=100", token)

    blockers = merge_blockers(
        pull, issue_comments, inline_comments, runs, head_sha, resolved_roots, reviews
    )
    gate = "+".join(
        name
        for name, present in (
            ("greptile", greptile_reviewed(issue_comments, runs)),
            ("coderabbit", coderabbit_reviewed(inline_comments, reviews)),
        )
        if present
    ) or "none"
    cursor_signal = cursor_bugbot_signal(runs)
    # A declined review is not a stable state: keep waiting rather than reporting
    # a blocker whose only remedy is time. Only when nobody else has read this
    # head, though — otherwise a rate limit would hang a watch the merge helper
    # would happily clear.
    limited = coderabbit_waiting_for_review(
        status, reviews, head_sha, inline_comments
    ) and greptile_head_evidence(issue_comments, head_sha) is not None
    label = (
        f"head={head_sha[:8]} gate={gate} settled={settled} "
        f"blockers={len(blockers)} cursor={cursor_signal}"
        f"{' rate-limited' if limited else ''}"
    )
    detail = {
        "head": head_sha,
        "gate": gate,
        "blockers": blockers,
        "rateLimited": limited,
        "reviewSignals": {"cursorBugbot": cursor_signal},
    }
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
                    # A reviewer that never appeared gates nothing, and a merely
                    # slow Greptile looks identical to an exhausted one at this
                    # moment. Say so, so a ready verdict is never read as "every
                    # reviewer passed it".
                    print(
                        "\nNOTE: ready on CodeRabbit alone — Greptile posted no "
                        "summary and no check. If Greptile was only slow, re-run "
                        "before merging."
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
