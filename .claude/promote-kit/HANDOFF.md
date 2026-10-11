# Promote handoff (cloud session → "Promoting PRs review workflows")

This branch only carries the promote tooling and notes. It is not meant to merge.
The repo's own rules (AGENTS.md, src/AGENTS.md, .claude/skills/prepare and
promote) still govern; this file records what is not in the repo.

## Branches

| Branch | Head | Contents |
|---|---|---|
| `claude/promote-handoff-wave-09` | `dc44367f` | wave 9 head `b5102b80` + `bbbec30d` "Fix promote review round 1" + `dc44367f` "Fix the account-takeover relink" |
| `claude/promote-handoff-wave-10` | `51a2107d` | wave 10 head `01e0edf2` + "Fix promote review round 1" (cron telemetry lint rule, database-clock tests) |
| `claude/promote-handoff-wave-11` | see part 2 message | wave 11 head `55d0e25b` + "Fix promote review round 1" (recordAbortedFailures on the two timer-abort routes) |
| this branch | — | the before/after screenshot kit, page builder, helper scripts, walkthrough data, review reports |

Nothing was pushed to the wave branches, development or staging. Wave 9's
branch passed a full `pnpm verify` (965 files, 6,960 tests; the one skip is
the advisory-lock concurrency suite, which passes on its own) and `pnpm check`.

## State

- Promote 8 (#675) merged into staging as `3c89c0fc`. development = `3a8e28c3`.
- Wave 9 (#676) is reviewed, its fixes are built and verified, and its owner
  walkthrough is published: https://claude.ai/artifact/EAaJseEuwLNgyaYL7jzNKr
  The owner has not yet answered its six questions or said go.
- Waves 10 (#677) and 11 (#678) are reviewed early, with fixes on the handoff
  branches. No walkthroughs yet.
- Waves 12–16 (#680–#684) and #679 (daily test cleanup) are not reviewed.
- #646 (codex draft) is excluded by the owner.

## The owner's process (mandatory from promote 8 on)

1. Before each prepare/promote cycle: a before→after walkthrough, as a
   published artifact page with before/after screenshots of every visual
   change. Old = origin/staging; new = what will ship. Run them as two local
   dev servers. Mocking local data, accounts or permissions is fine; the E2E
   Pilot may be made admin and kept durable.
2. With it, a chat write-up the owner plays through text-to-speech:
   (a) what to look for on the page; (b) every behind-the-scenes change in
   plain English; (c) decisions for him. Do not describe setup or mocking.
3. He reviews, may iterate, then says go. Only then: prepare (merge the wave
   PR into development), promote (development→staging PR, round 1, Greptile,
   Verify, Coverage health), merge.

Format reference: promote 8 page https://claude.ai/artifact/1V6Qdv3Qf1wBGg6MqYLpPo

## Order

1. Wave 9: merge #676 into development (REST merge pinned to its head), merge
   `claude/promote-handoff-wave-09` into development, `pnpm verify`, push,
   open promote 9, round-1 comment, `@greptile review`, dispatch Verify.
2. Wave 10: retarget #677 to development after #676 merges, then same, with
   `claude/promote-handoff-wave-10`.
3. Wave 11: #678 likewise, with `claude/promote-handoff-wave-11`, PLUS the
   P297 option 2 change (below), which is not built yet.
4. Waves 12–16, then #679 (ask the owner where it fits).
5. After all merges: the owner's deferred security/abuse audit (below).

## Owner rulings (not in the repo)

- Promote 8: default `/opengraph-image` share card for industry pages
  (approved). Neutral "—" security pill is moot (0 null-security systems).
- P254: delete the three unused auth_error codes (approved).
- Account takeover: ship the fix with wave 9 through the normal path. No
  hotfix, no production data check.
- P297 corp roles: option 2. Reuse stored corp roles only until ESI's own
  expiry (from the Expires that readEsiAuthed already returns), not
  fetched_at + 1h, so role changes still register in about an hour.
- Abuse/budget issues (anonymous ESI-budget drain via /api/eve/names and
  market history, public-route Neon writes) stay out of the promotes; they go
  to a post-merge audit.
- Reviews may use workflows. Greptile must reach 5/5 within 3 passes;
  re-posting `@greptile review` is fine. CodeRabbit only when ≤100 files.
- Review incoming waves early while blocked; never merge ahead of his go.

## Open owner questions from the wave 9 walkthrough

1. Add a line near Unlink saying a later direct sign-in with an unlinked
   character starts a new account, and Add character brings it back?
2. A general "your login didn't finish, try again" home notice for other
   failed sign-ins (only `account_not_linked` has copy now)?
3. Convert the four admin buttons that still answer refusals with raw JSON
   (Reassign, role toggle, Force logout, ESI job Retry) in a later wave?
4. Reassign tidy-up failure now shows a 500 page although the move committed.
   Fine, or redirect with a notice?
5. "Check feed now" while a refresh runs now counts as a conflict on the
   Mutations line. Keep, or count as a rejected request?
6. Keep or remove the corp-structures read route nothing calls any more?

## Audit list (post-merge)

- Anonymous ESI-budget drain; public-route Neon writes.
- Legacy account rows with NULL owner_hash and no readable owner claim take
  the 'backfill' branch (owner-reconcile.ts:27): a buyer's sign-in stores the
  buyer's hash on the seller's row and signs into the seller.
- Users left with zero EVE links are never purged (now unreachable).
- P241: cache-tag expiries queued by runPurge are dropped when a later purge
  contributor throws (Next drops pending revalidations on a thrown handler),
  and the retry never re-expires them.
- finishDeletionJob holds its transaction across the SSO revoke and Convex
  calls.
- Chart screen-reader readout: arrowing through TimeSeriesFrame charts
  announces nothing. Needs a shared live-readout primitive (the ui lint bans
  hand-built role=status), role="group", keyboard-only feeding.
- #646 must migrate QueuePager to onPageChange and its buildBreadcrumbList
  call to `{ name, path }` without its own Home crumb when it resumes.

## How review rounds ran

- Round 1: parallel general-purpose agents, one per lens, in the background,
  on the session model. Each reads a shared brief (see
  review-common-example.md): repo, OLD/NEW refs, diff command, PR body with
  declared behaviour changes, strictly read-only, "report only defects tied to
  a concrete failure; try to refute; list refuted leads". Reports are in
  review-reports/. Verify each finding yourself.
- Fixes: docs-researcher brief first; code; test-runner; mutation check (the
  test-runner won't edit source or run compound commands, so swap the old
  source in yourself and have it run vitest); commit "Fix promote review
  round 1"; `pnpm verify`; push; round comment with head SHA and dismissals.
- Greptile: `@greptile review`; triage fix / dismiss / ask; reply on and
  resolve every thread. Greptile replies on a thread before its summary
  updates: poll the summary comment until it names the new head SHA.
- Verify: `gh api -X POST repos/StorminRH/lgi-tools/actions/workflows/test.yml/dispatches -f ref=development`.
- Walkthrough: one workflow with 4 explain agents (schema: id, title, where,
  before, after, user_visible, visual, behind_the_scenes, risk_notes,
  owner_question, shots), one capture agent using this kit, one check-shots
  agent that reads every PNG. Then `build_review.py <config>` with
  review_template.html; convert large PNGs to webp; publish with the Artifact
  tool (`root` + `files`).

## Gotchas

- `gh pr merge` fails (GraphQL 403). Merge with
  `gh api -X PUT repos/StorminRH/lgi-tools/pulls/N/merge -f merge_method=merge -f sha=<full head sha>`.
- Review threads: `GET pulls/N/ccr/review_threads` → `[{resolved, comment_ids}]`;
  resolve `POST pulls/N/ccr/comments/<id>/resolve`; reply
  `POST pulls/N/comments/<id>/replies -F body=@file`. End every post with the
  Claude Code footer.
- Stop next dev before `pnpm verify`. Don't use `pkill -f` patterns that match
  your own shell; use `ps -eo pid,args | grep "[n]ext-server"`.
- `FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 pnpm verify`, then
  `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools pnpm exec vitest run src/db/advisory-lock.concurrency.test.ts`.
- When a wave deletes or moves an export, grep eslint.config.mjs for
  restricted-import entries naming it.
- The synthetic pilot mint is refused by a server whose
  SUPERADMIN_CHARACTER_ID is the pilot (9000001); mint on another server. The
  cookie is host-wide across localhost ports.
- The kit scripts were written for the cloud container (Playwright at
  /opt/pw-browsers/chromium, `.claude/cloud/stack.sh`); adjust paths locally.

## Other sessions

The refactor session ("Primitive extraction waves 8–16") was asked not to push
to claude/primitives-wave-09, -10 or -11 until the owner rules, to keep later
waves off auth.ts accountLinking and repairUserIdentity, and not to build on
P297's fetched_at rule. It has since reported handing the promote role to the
owner.
