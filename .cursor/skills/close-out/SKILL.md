---
name: close-out
description: Close out every merge onto staging or main. Always use when the operator asks to close out, or to merge onto staging or main.
---

# Close out work

One process. Destination is Origin `staging` or Origin `main`. Head is
`development` onto `staging` and `staging` onto `main` unless the
operator named another. A named feature head is fine.

## Process

Done when the Origin PR has merged to the destination.

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
6. Open the Origin PR (`<head>` → destination) per **Origin PR**. Done
  when that PR is ready for review.
7. Watch Depot on that PR per **Depot**. Done when the pipeline is
  green or a failure is in hand.
8. Fix each Depot failure on the head, push, and return to step 7.
  Done when Depot is green.
9. When the destination is `main`, merge per **Merge**. Done when
  Origin `main` holds the head. Return `RELEASED`.
10. Dump the isolated packet per **Dump**. Done when the dump PR is
  open ready and Greptile and CodeRabbit have been requested.
11. Address every dump finding on the head. Pause in chat with the
  reasoning when leaving a finding unfixed. Re-push the dump branch
    after each Origin fix. Done when every finding is fixed, or the
    operator has that pause.
12. Author as-builts for the work this PR delivers to `staging`, per
  `docs/workflows/schema/session-as-built.md`. One record per session
    in the range, and one for ordinary work in the same PR. A session
    that still has work only on `development` waits for a later
    close-out. The Delivered outcome carries the player-facing bullets
    the changelog will lift. Run the local test suite on that head.
    Push the as-builts and any dump fixes to the Origin PR. Done when
    those commits are on that PR.
13. Watch Depot per **Depot**. Merge per **Merge**. Close the dump PR
  unmerged. Done when Origin `staging` holds the head. Return
    `PROMOTED`.

Outputs. Exactly one:

- `PROMOTED`. Destination `staging`. Origin PR merged. Dump PR closed
unmerged.
- `RELEASED`. Destination `main`. Origin `main` holds the cut.
- `BLOCKED`. Named gate, oversize packet, failed check, missing
destination, or work already on the destination before this process
finished.

## Origin PR

Done when the Origin PR is open ready.

`origin pr create` defaults to draft. A draft that is later marked ready
runs Depot twice. Open it ready (`origin pr create --status open`).
Head and base are the two lines. Headings in order: `## What this does`,
`## Why`, `## Notes`, `## Test plan`. Scrub title and body:

```bash
python3 tools/cli.py delivery scrub-pr-body --check \
  --body-file "$PR_BODY_FILE" \
  --title "$PR_TITLE"
```

Re-scrub after publish.

## Depot

Done when that Origin PR's Depot pipeline is green.

Wait with `origin pr checks --watch`. If Checks are empty while Depot
is running, use
`depot ci run list --repo stormin/lgi-tools --org k2f4dzqwd4` and
`depot ci status <run-id> --org k2f4dzqwd4`.

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

Merge with `origin pr merge`. That merge is what moves the work onto
the destination. A push or fast-forward onto `staging` or `main` is
the same merge. It waits for this step. Delete leftover source
branches. Leave `development`, `staging`, and `main`.

## Return

Render this form in chat as these four bullets.

## Close-out: `PROMOTED` | `RELEASED` | `BLOCKED`

- **Subject:** `<destination>`; `<from>` → `<to>`; head `<full SHA>`
- **Result:** <what completed; ≤2 sentences>
- **Action:** <next step; Origin PR URL or merge SHA when present>
- **Blocker:** <exact blocker or `None`>

