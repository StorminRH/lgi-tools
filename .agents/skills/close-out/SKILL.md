---
name: close-out
description: >-
  Run the LGI.tools end-of-session close-out routine for a finished sub-version:
  follow docs/SESSION_END.md (shut down the dev env + clear the .next cache,
  fix-before-close, commit, push, verify the preview), and if the sub-version is
  complete, open ONE PR per docs/PR_REVIEW.md, run the Greptile review loop to a
  clean 5/5 fixing every finding in-branch, then squash-merge and reconcile main.
  Use this whenever the user wants to wrap up / ship the current work — phrasings
  like "close out", "do the session end", "wrap up", "ship it", "run the greptile
  loop", "finish up and merge", or "take this to merge". Invoking this command is
  the user's per-run go-ahead to MERGE — but only on a genuinely clean review.
---

# Session close-out (LGI.tools)

Drives the project's end-of-session routine all the way to a merged, deployed
sub-version, with no loose ends. The companion docs own the details — this skill
sequences them and carries one extra thing: **the user's standing authorization
to merge this PR once the review comes back clean.**

## The merge authorization (read first)

Invoking `/close-out` IS the user's go-ahead to merge — but it is **conditional
and per-invocation**, not a blanket rule. Merge only on a genuinely clean review:
**Greptile 5/5 with no open findings, CI green, PR mergeable/CLEAN.** If the
review isn't clean, keep fixing (Step 3) or pause and report what's blocking —
never merge on red CI or unresolved findings. The intent is "no loose ends,"
not "merge regardless." When in doubt, surface the state and stop.

## Step 1 — Follow `docs/SESSION_END.md`

Read it and do what it says. The load-bearing parts:
- **Shut the dev env down, then clear the cache.** Stop `next dev` and any
  `npx convex dev`, confirm the ports answer nothing, and **`rm -rf .next`**. The
  cache clear isn't cosmetic — a multi-GB `.next` drives Turbopack's file watcher
  into an idle CPU-spin and inflates dev memory ~10× (the 3.6.9 dev-melt root
  cause; see `docs/DEV_PERF_DIAGNOSIS.md`). It regenerates, so clearing is free.
- **Fix before you close.** Resolve what you found this session in-branch; only
  genuinely out-of-scope work goes to `docs/backlog.md`.
- **Commit** in plain English (AGENTS.md style — no jargon/paths in the message),
  **push**, and **verify the Vercel preview**.
- **Update `docs/SCRATCHPAD.md`** per its rules (durable discoveries only).

## Step 2 — If this is the final session of the sub-version, open the PR

If more sessions remain on the branch, stop after Step 1 — no PR. Otherwise read
`docs/PR_REVIEW.md` and follow it:
- One PR → `main`, plain-English title/body written for external/forking devs,
  with a filled test plan (what you verified and how).
- If the work is user-facing, bump `APP_VERSION` (`src/config/app-version.ts`)
  and add an entry to its master file `content/changelog/vX.Y.md` (grouping is derived
  from the version prefix — no per-entry markup). When the entry is the first release
  of a new master version, create that file starting with its themed `## vX.Y — Title`
  heading (the loader auto-sorts it newest-first). The exact format is in
  `docs/PR_REVIEW.md`; the parser is strict — confirm it still parses.
- Confirm CI is green (test/typecheck/lint/fallow, semgrep, Vercel) before leaning
  on Greptile.

## Step 3 — Run the Greptile loop to resolution

Start a **background poll the moment the PR is open** — don't hand-recheck. The
critical gotcha: **Greptile edits its summary comment in place**, so select the
`greptile-apps[bot]` comment by **`max_by(.updated_at)`** (never `last`) and gate
on the body referencing the **current head sha**, so a re-review of your latest
push isn't satisfied by a stale prior body. Poll both the issue comments (the
summary) and the pulls comments (inline findings). The exact poll snippet is in
`docs/PR_REVIEW.md` — use it.

For every finding: **fix it in-branch and push, or justify it in writing on the
PR.** Re-review after each push. Iterate until Greptile is **5/5 with no open
findings** (or all remaining findings are explicitly justified). Don't expand
scope during the loop — separate or larger problems go to `docs/backlog.md`, not
into this PR.

## Step 4 — Merge (pre-authorized, clean-only)

When all three hold — Greptile 5/5 / no open findings (or justified), CI green,
PR `MERGEABLE`/`CLEAN` — merge with `gh pr merge <#> --squash --delete-branch`.
If any condition fails, do not merge; report what's blocking.

**Immediately before the merge command, RE-READ the live review** — the summary
(`max_by(.updated_at)`) plus the full inline-comment list — and require that it
still shows 5/5 for the current head with no greptile comment newer than the body
your poll gated on. Review passes race (a fix-push and an `@greptileai` mention
each fire one) and Greptile edits its verdict in place: on PR #201 a second pass
flipped 5/5 → 4/5 and posted a new P1 forty seconds before the merge. A passed
poll is stale evidence by merge time; the re-read is the actual gate (full rules:
`docs/PR_REVIEW.md` Step 2's race gotcha + Step 4). Likewise, a justification
reply is never merged past while its response is pending.

## Step 5 — After merge

- **Reconcile main.** Verify `origin/main` advanced and local `main`
  fast-forwarded. Watch the divergence gotcha: `gh pr merge --delete-branch` can
  abort the local fast-forward *while the remote merge already succeeded* (an
  unpushed local-`main` commit diverges it). Check the PR's `MERGED` state first,
  then reset local `main` to `origin/main` if it diverged. `git remote prune
  origin` to drop the deleted branch ref.
- **Confirm the production deploy reaches Ready** (`vercel inspect <url> --wait`).
- **Update the SCRATCHPAD shipped ledger** (the sub-version → one line: PR #,
  squash sha, Greptile score, prod-deploy id).
