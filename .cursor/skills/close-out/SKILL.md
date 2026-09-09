---
name: close-out
description: Close out every merge onto staging or main. Always use when the operator asks to close out, or to merge onto staging or main.
---

# Close out work

One process. Destination is GitHub `staging` or GitHub `main`. Head is
`development` onto `staging` and `staging` onto `main` unless the
operator named another. A named feature head is fine.

## Process

Done when the destination holds the head and the other integration
line contains that tip.

Write this process as a todo list before naming the lines. One item
per numbered step. Give the Actions wait its own item named
`GitHub Actions Verify`. Keep that item in progress until `verify`, `build`,
and `e2e` are green on the current PR run. Done when the list exists and step 1 is in progress.

1. Name the two lines. Fetch `origin/<head>` and
   `origin/<destination>`. Work from the head tip. Uncommitted Ordered
   work on `development` returns to `start-session`. start-session
   `promote-needed` is this process onto `staging`. Done when the two
   lines are named and, when the destination is `main`, the changelog
   is on the head. Onto `main`, set `APP_VERSION` in
   `src/config/app-version.ts` to the latest lifecycle identity already
   on the head.
   Write the public changelog from the as-builts in
   `<head>...main` per `docs/workflows/schema/changelog-entry.md`. The
   overview is the as-built Delivered paragraphs, invoked through
   `unslop`. The bullets are those records' `Added:` / `Changed:` /
   `Fixed:` / `Removed:` lines, rewritten into player speech as you
   lift, then grouped in that order. Run
   `python3 tools/cli.py lifecycle check-release --check --expect reconciled`.
   Land that commit on the head.
2. Size gate. Run
   `python3 tools/cli.py lifecycle count-app-facing --list --base origin/<destination> --head origin/<head>`.
   Count is due at 80 versus `staging`. A smaller clean chunk is fine
   when the operator asked for one, including staging web testing. The resolver
   also routes here below 80 when version 4.1 or later completion still needs
   delivery of plans or final records. Reviewers run
   `gh pr diff <N> --repo StorminRH/lgi-tools` after the draft exists.
   Destination `main` still runs the count. Done when the count is known.
3. Run the local test suite through `test-runner` until it passes.
   Done when every local-suite command in `AGENTS.md`, including
   both Fallow dead-code modes and focused tests for the diff, is green
   on the head.
4. Open the GitHub draft (`<head>` → destination) per **GitHub PR**.
   Done when that PR is draft and the PR number and head SHA are known.
5. Comments. Invoke `no-comments` on that GitHub PR. It spawns
   `comment-sicko`. Both write. Run the local test suite through
   `test-runner`. Done when accepted deletions and in-scope fixes
   are on the head and the suite is green.
6. When the destination is `staging`, request bots per **Bot reviews**.
   Done when Greptile and CodeRabbit have been requested on that same
   PR. Destination `main` skips this step.
7. Freeze and review. Invoke `adversarial-review` on that GitHub
   PR. Brief is the PR number and head SHA. Every review seat runs
   `gh pr diff <N> --repo StorminRH/lgi-tools`. Request Bugbot once
   by hand on the same PR. Done when every freeze seat has returned,
   Bugbot and the requested bot reviews have finished posting, and the
   tree is still the freeze head.
8. One batch. Triage every finding from that settled window.
   Dedupe. Accept or reject. Fix the accepted set on the head.
   Note dispositions on the GitHub PR. Run the local test suite.
   Reject findings with evidence when they are false positives, hypothetical
   misuse by absent callers, or changes whose cost outweighs their benefit.
   Report the justification and continue. Pause only for an unresolved material
   risk, disputed product behavior, or deferral of a confirmed defect.
   Done when every finding has a disposition, accepted fixes are on the
   head, and the suite is green.
9. When the destination is `staging`, author as-builts for the
   work this PR delivers, per `docs/workflows/schema/session-as-built.md`.
   Write a numbered final record for each completed session and a separate
   record for ordinary work. For an incomplete session, write an ordinary-work
   style partial-delivery record linked to its session and delivered OWs;
   record available proof without claiming unfinished criteria passed. Reserve
   its numbered final record for the promotion completing the session. From
   version 4.1 onward, every finalized session names this GitHub PR and its
   actual head branch; retain historical record rules through version 4.0.
   Link earlier partial records to avoid duplicate changelog lines. The
   Delivered outcome carries the plain-speech bullets the changelog will lift.
   Push the as-builts and any remaining bot-review fixes to the
   GitHub draft. Run the local test suite on that head. Done when
   those commits are on that PR and the suite is green.
10. Run per **GitHub Actions**. That command is the watch todo. Done
    when the pipeline has settled (green or finished red).
11. When Actions is red, one **Findings** cycle, then return to
    step 10. Done when `verify`, `build`, and `e2e` are green.
12. When the destination is `main`, merge per **Merge**. Resync
    per **Resync**. Done when GitHub `main` holds the head and
    `staging` and `development` contain `main`. Return `RELEASED`.
13. When the destination is `staging`, unresolved GitHub review
    threads are empty per **Merge**. Merge per **Merge**.
    Done when GitHub `staging` holds the head.
14. When the destination is `staging`, resync per **Resync**. Done when
    `development` contains
    `staging`. Return `PROMOTED`. When the operator requested staging web
    testing, hand back to the pending `ux-check` or OW visual pause. The merge
    does not approve the UI; testing and operator disposition remain required.

Outputs. Exactly one:

- `PROMOTED`. Destination `staging`. GitHub PR merged.
  `development` contains `staging`.
- `RELEASED`. Destination `main`. GitHub `main` holds the cut.
  `staging` and `development` contain `main`.
- `BLOCKED`. Named gate, failed check, missing
  destination, work already on the destination before this process
  finished, or a GitHub token that is not scoped for merge. The
  GitHub PR stays open.

## GitHub PR

Done when the GitHub PR is draft and the PR number and head SHA are known.

Pass `--draft` explicitly. Leave it draft through reviews
and fixes. Always pass `--head`, `--base`, and `--repo`; after `test-runner`
the checkout can be detached and inference misses.
`gh pr create --draft --head <head> --base <destination> --repo StorminRH/lgi-tools`.
Read the head SHA with
`gh pr view <N> --repo StorminRH/lgi-tools --json headRefOid,baseRefOid`.
Headings in order: `## What this does`,
`## Why`, `## Notes`, `## Test plan`. Scrub title and body:

```bash
python3 tools/cli.py delivery scrub-pr-body --check \
  --body-file "$PR_BODY_FILE" \
  --title "$PR_TITLE"
```

Re-scrub after publish.

## GitHub Actions

Done when that GitHub PR's current `verify`, `build`, and `e2e` jobs are green.

Select the PR's Verify run once reviews are idle and the local suite is green
on that head:
`gh run list --repo StorminRH/lgi-tools --workflow test.yml --event pull_request --branch <head-branch>`.
Confirm the run belongs to this PR and its current head/base. The PR-only
`ci-subject` artifact records the head, base, and actual tested merge SHA.
Watch with `gh run watch <run-id> --repo StorminRH/lgi-tools --exit-status`
until it returns. That command is the watch todo. Keep the todo in
progress until all three jobs are green. After `test-runner` the checkout
can be detached, so pass the head branch explicitly. Inspect jobs with
`gh run view <run-id> --repo StorminRH/lgi-tools --json headSha,event,attempt,jobs`.
Missing, failed, or stale jobs block completion.

The workflow runs on `pull_request` and `workflow_dispatch`. A deliberate
rerun of the same current PR subject uses
`gh run rerun <run-id> --repo StorminRH/lgi-tools`; it does not test a new head.
`gh workflow run test.yml --repo StorminRH/lgi-tools --ref <head-branch>`
dispatches a branch, not a PR merge ref, and emits no PR-only `ci-subject`
artifact. Use the PR run for this process.

On red, inspect jobs then
`gh run view <run-id> --repo StorminRH/lgi-tools --log-failed`.
The fix is a Findings cycle.

## Findings

Done when Actions is idle, one comment records the cycle, and the
review threads are resolved or the operator paused.

A finding is a red Actions job, a bot comment, or a review note
on the GitHub PR, including Bugbot. The first batch is step 8.
A red run is a new cycle on the same rule: diagnose, one
batch, local suite, the new head's PR run.

1. Collect every finding from that red run: Actions jobs/logs
   and any new review notes.
2. One batch. One commit per fix is fine. Justify on the GitHub PR
   when a bot finding is wrong. Defer only on an explicit
   operator cut. Run the local test suite on the batch.
3. One push to the GitHub head. Re-read `headRefOid` with
   `gh pr view <N> --repo StorminRH/lgi-tools --json headRefOid`
   if `view` still shows the previous head.
4. One GitHub comment (`gh pr comment <N> --repo StorminRH/lgi-tools --body-file <comment-file>`)
   naming the head SHA and every finding's disposition. Record the comment URL.
5. Resolve the addressed review thread IDs per `AGENTS.md`. Another
   cycle after the next settle if Actions is still red or new
   review lands.

Bot comments and dispositions are on the same GitHub PR. The cycle
comment URL is the log; conversation comments are not resolvable threads.

## Bot reviews

Done when the GitHub PR holds the current head SHA and both bots
have been requested.

Request Greptile and CodeRabbit once by hand on the same GitHub PR
on `StorminRH/lgi-tools`. The PR gets one review pass. CodeRabbit uses the free tier;
a single response is expected. Review fixes locally and keep the PR head
current without requesting another bot pass or waiting for review credits.
A later rate-limit notice does not invalidate the completed first pass.
Record a disposition for any additional findings that arrive without restarting
the review loop.

## Merge

Done when the GitHub PR is merged to its base line.

The unresolved GitHub review-thread query in `AGENTS.md` is empty and every pre-merge operator
pause has a recorded disposition. An operator-requested staging test is a
post-promotion pause: record that direction, complete this process, then return
to the pending test. Other pending pauses stop the merge.
Mark ready with `gh pr ready <N> --repo StorminRH/lgi-tools`, then merge with
`gh pr merge <N> --repo StorminRH/lgi-tools --merge --match-head-commit <head-sha>`.
That merge is what moves the work onto the destination. It waits for this step.
Use `--merge` to preserve ancestry; squash/rebase change that behavior.
`--auto` defers the merge and is not completion; `--branch` is not a merge flag.
A Cloud Agent token that is not scoped for merge
returns `BLOCKED` with that error. Leave the GitHub PR open.
The operator reviews and merges, or upgrades the token. Delete
leftover source branches. Leave `development`, `staging`, and
`main`. Return after **Resync**.

## Resync

Done when the other integration line contains the destination tip.

Fetch `origin/development`, `origin/staging`, and `origin/main`.
The `origin` remote names GitHub after cutover. If protection refuses a
resync push, return `BLOCKED`; an ancestry-only PR merge route is not yet
proven. Do not force-push or disable protection.

Destination `staging`: update `origin/development` so it contains
`origin/staging`. Fast-forward when development has no unique
commits (`git push origin origin/staging:development`). Merge
`staging` into `development` and push when it does. Done when
`git merge-base --is-ancestor origin/staging origin/development`.
Check out `development` at that tip.

Destination `main`: the same onto `origin/main` for both `staging`
and `development`. Done when both contain `origin/main`.

## Return

Render this form in chat as these four bullets.

## Close-out: `PROMOTED` | `RELEASED` | `BLOCKED`

- **Subject:** `<destination>`; `<from>` → `<to>`; head `<full SHA>`
- **Result:** <what completed; ≤2 sentences>
- **Action:** <next step; GitHub PR URL or merge SHA when present>
- **Blocker:** <exact blocker or `None`>
