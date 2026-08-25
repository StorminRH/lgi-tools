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
per numbered step. Give each Depot wait its own item named
`origin pr checks <N> --watch`. Keep that item in progress until the
command has returned green on the current PR version. Done when the
list exists and step 1 is in progress.

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
2. Isolate the app-facing files. Done when the packet is the `--list`
  output for these two lines. Run
   `python3 tools/cli.py lifecycle count-app-facing --list --base origin/<destination> --head origin/<head>`.
   Count is due at 80 versus `staging`. A smaller clean chunk is fine  when the operator asked for one. A pile over 100 is `BLOCKED`. Split first.
3. Invoke `adversarial-review` on that isolated packet. Keep the tree
  still. Done when the review has returned its verdict form.
4. Address every accepted finding on the head. Pause in chat with the
  reasoning when leaving a finding unfixed. Done when every accepted
   finding is fixed, or the operator has that pause.
5. Run the local test suite through `test-runner` until it passes.
  Done when `pnpm typecheck`, `pnpm lint`, Fallow `dead-code`,
   `dupes`, and `health`, plus focused tests for the diff, are green.
6. Open the Origin PR (`<head>` → destination) per **Origin PR**.
  Done when that PR is ready for review.
7. Run `origin pr checks <N> --watch` on that PR per **Depot**. That
  command is the watch todo. Done when the pipeline has settled
   (green or finished red).
8. When Depot is red, run one **Findings** round, then return to
   step 7. Done when Depot is green.
9. When the destination is `main`, merge per **Merge**. Resync per
  **Resync**. Done when Origin `main` holds the head and `staging`
   and `development` contain `main`. Return `RELEASED`.
10. Dump the isolated packet per **Dump**. Done when the dump PR is
  open ready and Greptile and CodeRabbit have been requested.
11. Wait for dump review to settle, then one **Findings** round.
  Done when that round's comment is resolved, or the operator
    has that pause.
12. Author as-builts for the work this PR delivers to `staging`, per
  `docs/workflows/schema/session-as-built.md`. One record per session
    in the range, and one for ordinary work in the same PR. A session
    that still has work only on `development` waits for a later
    close-out. The Delivered outcome carries the player-facing bullets
    the changelog will lift. Run the local test suite on that head.
    Push the as-builts and any dump fixes to the Origin PR. Done when
    those commits are on that PR.
13. Run `origin pr checks <N> --watch` on the current version per
  **Depot**. `origin pr thread list --unresolved` empty. Merge per
  **Merge**. Close the dump PR unmerged. Done when Origin `staging`
  holds the head.
14. Resync per **Resync**. Done when `development` contains `staging`.
    Return `PROMOTED`.

Outputs. Exactly one:

- `PROMOTED`. Destination `staging`. Origin PR merged. Dump PR closed
unmerged. `development` contains `staging`.
- `RELEASED`. Destination `main`. Origin `main` holds the cut.
`staging` and `development` contain `main`.
- `BLOCKED`. Named gate, oversize packet, failed check, missing
destination, work already on the destination before this process
finished, or an Origin token that is not scoped for merge.

## Origin PR

Done when the Origin PR is open ready.

`origin pr create` defaults to draft. A draft that is later marked ready
runs Depot twice. Open it ready. Always pass `--head` and `--base`;
after `test-runner` the checkout can be detached and inference misses.
`origin pr create --head <head> --base <destination> --status open`.
Headings in order: `## What this does`,
`## Why`, `## Notes`, `## Test plan`. Scrub title and body:

```bash
python3 tools/cli.py delivery scrub-pr-body --check \
  --body-file "$PR_BODY_FILE" \
  --title "$PR_TITLE"
```

Re-scrub after publish.

## Depot

Done when that Origin PR's Depot pipeline is green.

Run `origin pr checks <N> --watch` in the foreground until it
returns. `<N>` is the change number. That command is the watch
todo. Keep the todo in progress until watch returns. After
`test-runner` the checkout can be detached, so pass `<N>` (or
`--branch <head>`). `--head` and `--base` are create flags;
checks rejects them. A subscription or a one-shot `--json` read
is extra, not the wait.

If Checks are empty while Depot is running, list then poll status per
Tools. On red, diagnose then logs. The fix is a Findings round.

## Findings

Done when Origin checks are idle, Origin reviews are idle, dump
review is idle when a dump exists, one comment records the
round, that comment's thread is resolved or the operator paused,
and the dump branch matches the Origin head when a dump exists.

A finding is a red Depot job, a dump bot comment, or a review note
on the Origin PR. Drive ready PRs in batched rounds: wait for
reviews to settle, then one comment and one push.

1. Wait until Origin checks have finished (`origin pr checks <N>
   --watch`, or Depot list/status when Checks are empty), Origin
   reviews on that version have finished posting (`origin pr view
   --comments`), and, when a dump PR exists, Greptile and
   CodeRabbit have finished posting.
2. Collect every finding from that settled state: Depot
   diagnose/logs, dump PR comments, and Origin review notes.
3. Fix in-scope findings. One commit per fix is fine. Justify on
   the dump PR when a dump finding is wrong. Defer only on an
   explicit operator cut. Run the local test suite on the batch.
4. One push to the Origin head. One re-push of the dump branch
   when a dump exists. `refresh` if `view` or `checks` still show
   the previous version.
5. One Origin comment (`origin pr comment`) naming the version and
   every finding's disposition. Origin assigns the thread id.
6. Resolve that thread id when the round is the log. Another round
   after the next settle if Depot is still red or new review lands.

Dump comments start on GitHub. The Origin comment and its thread
id are the log.

## Dump

Done when the dump PR holds only the isolated packet at the current
head SHA, is open ready, and both bots have been requested.

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
returns `BLOCKED` with that error. The operator merges or
upgrades the token. Delete leftover source branches. Leave
`development`, `staging`, and `main`. Return after **Resync**.

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

