#!/usr/bin/env python3
"""Poll a PR until Greptile reviews the current head, CI finishes, or every bot
and check on the head goes quiet.

Examples:
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 greptile
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 checks
  python3 .agent-local/poll_pr_gate.py StorminRH/lgi-tools 228 quiescent

The script prints only state changes, then the final details. `greptile` and
`checks` return 0 for a clean current-head Greptile 5/5 or green checks and 2
when a completed gate contains findings or failures. `quiescent` waits until the
head's reviewer set is complete and stable (so a late-registering bot is never
missed); it returns 0 once every reviewer is done — so fixes can be batched
before the next push — and 1 on timeout, leaving the pass/fail verdict to the
`greptile` gate and the merge helper.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import time

from github_api import github_token, request


GOOD_CONCLUSIONS = {"success", "neutral", "skipped"}


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("number", type=int)
    parser.add_argument("gate", choices=("greptile", "checks", "quiescent"))
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()

    token = github_token()
    deadline = time.monotonic() + args.timeout
    last_label = None
    stable_marker: tuple[str, frozenset[str]] | None = None
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
