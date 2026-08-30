---
name: close-out
description: Close out every merge onto staging or main. Always use when the operator asks to close out, or to merge onto staging or main.
---

# Close out work

One process. Destination is Origin `staging` or Origin `main`. Head is
`development` onto `staging` and `staging` onto `main` unless the
operator named another. A named feature head is fine.

## Process

Done when the destination holds the head and the other integration
line contains that tip.

Write this process as a todo list before naming the lines. One item
per numbered step. Give the Depot wait its own item named
`depot ci dispatch`. Keep that item in progress until `depot ci status`
is green on that run. Done when the list exists and step 1 is in progress.

1. Name the two lines. Fetch `origin/<head>` and
   `origin/<destination>`. Work from the head tip. Uncommitted Ordered
   work on `development` returns to `start-session`. start-session
   `promote-needed` is this process onto `staging`. Done when the two
   lines are named and, when the destination is `main`, the changelog
   is on the head. Onto `main`, set `APP_VERSION` in
   `src/config/app-version.ts` to the latest lifecycle identity already
   on the head. Write the public changelog from the as-builts in
   `<head>...main` per `docs/workflows/schema/changelog-entry.md`. The
   overview is the as-built Delivered paragraphs, invoked through
   `unslop`. The bullets are those records' `Added:` / `Changed:` /
   `Fixed:` / `Removed:` lines, grouped in that order. Run
   `python3 tools/cli.py lifecycle check-release --check --expect reconciled`.
   Land that commit on the head.
2. Size gate. Run
   `python3 tools/cli.py lifecycle count-app-facing --list --base origin/<destination> --head origin/<head>`.
   Count is due at 80 versus `staging`. A smaller clean chunk is fine
   when the operator asked for one. Reviewers run
   `origin pr diff <N>` after the draft exists. When the destination
   is `staging`, the `--list` is dump isolation and a pile over 100
   is `BLOCKED`. Split first. Destination `main` still runs the
   count. It has no dump and no file cap. Done when the count is
   known and, for `staging`, under the cap.
3. Run the local test suite through `test-runner` until it passes.
   Done when `pnpm typecheck`, `pnpm lint`, Fallow `dead-code`,
   `dupes`, and `health`, plus focused tests for the diff, are green
   on the head.
4. Open the Origin draft (`<head>` → destination) per **Origin PR**.
   Done when that PR is draft and the change number is known.
5. When the destination is `staging`, dump per **Dump**. Done when
   the dump PR is open ready and Greptile and CodeRabbit have been
   requested. Destination `main` skips dump.
6. Freeze and review. Invoke `adversarial-review` on that Origin
   change. Brief is the change number. Every Cursor seat runs
   `origin pr diff <N>`. Bugbot on open. Dump bots when a dump
   exists. Done when every Cursor seat has returned, Bugbot and
   dump review have finished posting, and the tree is still the
   freeze head.
7. One batch. Triage every finding from that settled window.
   Dedupe. Accept or reject. Fix the accepted set on the head.
   Note dispositions on the Origin PR. Run the local test suite.
   Pause in chat with the reasoning when leaving a finding
   unfixed. Done when every accepted finding is on the head, or
   the operator has that pause, and the suite is green.
8. When the destination is `staging`, author as-builts for the
   work this PR delivers, per `docs/workflows/schema/session-as-built.md`.
   One record per session in the range, and one for ordinary work
   in the same PR. A session that still has work only on
   `development` waits for a later close-out. The Delivered
   outcome carries the player-facing bullets the changelog will
   lift. Push the as-builts and any remaining dump fixes to the
   Origin draft. Run the local test suite on that head. Done when
   those commits are on that PR and the suite is green.
9. Dispatch per **Depot**. That command is the watch todo. Done
   when the pipeline has settled (green or finished red).
10. When Depot is red, one **Findings** cycle, then return to
    step 9. Done when Depot is green.
11. When the destination is `main`, merge per **Merge**. Resync
    per **Resync**. Done when Origin `main` holds the head and
    `staging` and `development` contain `main`. Return `RELEASED`.
12. When the destination is `staging`, `origin pr thread list
    --unresolved` empty. Merge per **Merge**. Close the dump PR
    unmerged. Done when Origin `staging` holds the head.
13. Resync per **Resync**. Done when `development` contains
    `staging`. Return `PROMOTED`.

Outputs. Exactly one:

- `PROMOTED`. Destination `staging`. Origin PR merged. Dump PR closed
  unmerged. `development` contains `staging`.
- `RELEASED`. Destination `main`. Origin `main` holds the cut.
  `staging` and `development` contain `main`.
- `BLOCKED`. Named gate, oversize staging dump, failed check, missing
  destination, work already on the destination before this process
  finished, or an Origin token that is not scoped for merge. The
  Origin PR stays open.

## Origin PR

Done when the Origin PR is draft and the change number is known.

`origin pr create` defaults to draft. Leave it draft through reviews
and fixes. Always pass `--head` and `--base`; after `test-runner`
the checkout can be detached and inference misses.
`origin pr create --head <head> --base <destination>`.
Headings in order: `## What this does`,
`## Why`, `## Notes`, `## Test plan`. Scrub title and body:

```bash
python3 tools/cli.py delivery scrub-pr-body --check \
  --body-file "$PR_BODY_FILE" \
  --title "$PR_TITLE"
```

Re-scrub after publish.

## Depot

Done when that Origin PR's dispatched pipeline is green.

Dispatch once reviews are idle and the local suite is green on
that head:
`depot ci dispatch --repo stormin/lgi-tools --workflow test.yml --ref <head-branch> --org k2f4dzqwd4`.
Watch with `depot ci status <run-id> --org k2f4dzqwd4` until it
returns. That command is the watch todo. Keep the todo in
progress until status is green. After `test-runner` the checkout
can be detached, so pass the head branch explicitly. `origin pr
checks` stays empty on dispatch.

On red, diagnose then logs. The fix is a Findings cycle.

## Findings

Done when Depot is idle, one comment records the cycle, that
comment's thread is resolved or the operator paused, and the dump
branch matches the Origin head when a dump exists.

A finding is a red Depot job, a dump bot comment, or a review note
on the Origin PR, including Bugbot. The first batch is step 7.
A red dispatch is a new cycle on the same rule: diagnose, one
batch, local suite, one `dispatch`.

1. Collect every finding from that red run: Depot diagnose/logs
   and any new review notes.
2. One batch. One commit per fix is fine. Justify on the dump PR
   when a dump finding is wrong. Defer only on an explicit
   operator cut. Run the local test suite on the batch.
3. One push to the Origin head. One re-push of the dump branch
   when a dump exists. `refresh` if `view` still shows the
   previous version.
4. One Origin comment (`origin pr comment`) naming the version and
   every finding's disposition. Origin assigns the thread id.
5. Resolve that thread id when the cycle is the log. Another
   cycle after the next settle if Depot is still red or new
   review lands.

Dump comments start on GitHub. The Origin comment and its thread
id are the log.

## Dump

Done when the dump PR holds only the size-gate paths at the
current head SHA, is open ready, and both bots have been requested.

Add a `github` remote to `https://github.com/StorminRH/lgi-tools.git`
when it is missing. Push Origin `staging` to GitHub `staging` so the
dump base matches the already-reviewed line. Build
`dump/<YYYY-MM-DD>-<shortsha>` from that base with only the isolated
paths at the head SHA. Open the GitHub PR ready for review on
`StorminRH/lgi-tools` (`dump/...` → `staging`) with `gh pr create` or
the GitHub MCP. Request Greptile and CodeRabbit by hand.

## Merge

Done when the Origin PR is merged to its base line.

`origin pr thread list --unresolved` is empty, or the operator
paused. Merge with `origin pr merge <N>`. That merge is what
moves the work onto the destination. It waits for this step.
`--merge`, `--squash`, `--auto`, and `--branch` hit the same
merge gate. A Cloud Agent token that is not scoped for merge
returns `BLOCKED` with that error. Leave the Origin PR open.
The operator reviews and merges, or upgrades the token. Delete
leftover source branches. Leave `development`, `staging`, and
`main`. Return after **Resync**.

## Resync

Done when the other integration line contains the destination tip.

Fetch `origin/development`, `origin/staging`, and `origin/main`.

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
- **Action:** <next step; Origin PR URL or merge SHA when present>
- **Blocker:** <exact blocker or `None`>
