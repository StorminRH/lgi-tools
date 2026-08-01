# SCRATCHPAD — LGI.tools

> Short cross-session memory. Keep this skimmable in about one minute. The
> upkeep procedure lives in `docs/workflows/close-out.md`.

## Now

- **CURRENT:** planned close-out for sub-version 4.0.2.3 (session 4.0.2.3.1) —
  the reactive chain read path on the Atlas canvas.
- **NEXT:** after the 4.0.2.3 PR merges, run
  `python3 tools/cli.py lifecycle resolve --pretty` and follow its directive
  (expected next sub-version is 4.0.3.1, the deterministic layout engine).
- **Chain read-set cost (4.0.2.3.1):** every PAGE is its own handler execution and
  every execution resolves the claim, so a map open costs
  `1 + ceil(N/100) + ceil(M/100)` indexed `mapAccess` claim reads — not one per
  subscription — plus the payload pages themselves, at
  `MAP_CHAIN_MAX_PAGE_SIZE = 100`. Per-update re-read shape is the point of the
  split, and is read-set-precise: a `mapSystems` write re-runs only the
  `watchMapSystems` page queries (their claim reads + N systems); a
  `mapConnections` write re-runs only `watchMapConnections` and CANNOT re-read the
  systems range; a claim write re-runs everything, since every execution reads that
  row; a `mapSignatures`/`mapNotes`/`mapSignatureActivity` write re-runs none of
  them, because no query here reads those tables.
- **Access is a subscription, not a thrown error (4.0.2.3.1, supersedes plan
  PD-4 by operator directive):** `watchMapAccess` answers `{ granted }` as a
  value and the two chain reads return an empty page when the claim is absent, so
  a revocation is a rendered state rather than an uncaught error in the Convex
  client's socket callback. Consequence worth keeping: a re-granted claim
  recovers the map live, with no reload and no access poller. The throwing
  `requireMapAccess` remains for the fixture mutations; `tryMapAccess` is the
  value-returning half and shares its one `by_map_user` lookup.
- **Provisional placement can arrive off-screen (4.0.2.3.1 demo residual, for
  4.0.3.1):** the grid walks row-major 6 wide at 220px, and the canvas carries no
  camera refit by design, so on a half-width window an arrival past slot ~4 lands
  outside the viewport and reads as "nothing happened". Within OOS-1 for this
  session — the layout engine owns real placement — but the layout engine should
  decide whether arrivals are brought into view.
- **Convex local backend was relaunched standalone during 4.0.2.3.1 SC-5.3**
  (killed to prove silent reconnection, then restarted outside the `convex dev`
  supervisor). Restart `pnpm dev:all` before relying on Convex hot-push again.
- **Convex local typecheck:** `convex/tsconfig.json` is present so
  `pnpm exec convex codegen --typecheck enable` exits 0 against a running local
  backend. Root `tsc --noEmit` remains the app-wide gate and also covers
  `convex/`.
- **Access/read-set cost (4.0.2.2.2 SC-4):** each gated fixture call reads 1
  indexed `mapAccess` claim row + at most `MAP_FIXTURE_PAGE_SIZE = 25` payload
  rows. At pinned sizes 50 systems / 30 connections / 60 signatures / 10 notes,
  drains measured 2 / 2 / 3 / 1 pages with max page ≤ 25. A full four-collection
  watch is therefore 4 claim reads + one page per open cursor per update cycle.
- **Live revocation probe (SC-3.2):** local backend (`CONVEX_DEPLOYMENT` began
  `local:`), admin-auth subscriber B received data, took no further action, and
  got `onError` with code `FORBIDDEN` 14 ms after the revoke POST. Probe script
  is not committed. Transcript:

```json
[
  {"t":1785551312141,"event":"warmup_query"},
  {"t":1785551312153,"event":"warmup_ok","pageLength":0},
  {"t":1785551312153,"event":"subscribe"},
  {"t":1785551312154,"event":"data","pageLength":0,"isDone":true},
  {"t":1785551312205,"event":"project_revoke"},
  {"t":1785551312216,"event":"project_revoke_ok","revokeCounts":{"deleted":1,"inserted":0,"unchanged":1,"updated":0}},
  {"t":1785551312219,"event":"onError","code":"FORBIDDEN","name":"ConvexError","data":{"code":"FORBIDDEN"}},
  {"t":1785551312219,"event":"result","result":"forbidden","sawForbidden":true,"latencyMs":14}
]
```
- **Deferred by operator ruling:** automatic corp-membership-drift trigger after
  a projection run; resync remains the correction tool until a later session.
- **Accepted residuals:** (1) a deleted map whose teardown POST failed has no
  automatic healer — operator must resync those logged map ids; (2) a projection
  racing a concurrent user purge can re-insert claims until the purge door or a
  resync runs again.
- **Refresh-shortfall:** projection throws only on transient ESI failure
  (5xx/budget/thrown); ESI 404 batch omissions are definitive and must not wedge
  convergence (biomassed characters leave stale cache fail-closed via
  `memberCorpIds`).
- **Fallow-driven seams:** `mapsPurgeContributor` stays in `src/data/maps/purge.ts`
  with `registerMapAccessProjectionPurgeHooks`; identity mutations use
  `registerIdentityProjectionHooks` from `map-access-identity.ts` so
  platform/auth never imports composition. Unlink/reassign/absorb/emptied-user
  deletes re-project or tear down in-session (not backlog).

## Current boundary

Version 3.10, “Hull Integrity + SKIN,” is closed and archived. Its roadmap,
contracts, plans, as-built records, audit evidence, and close record live in
`../LGI Tools Document Archive/versions/3.10/`.

Version **4.0, “The Living Map,”** is the active master version. Its plan is
`docs/VERSION_4_0_PLAN.md` and its approved delivery topology — 14 sub-versions
across 23 sessions — is the `## Status` table there. Every session is
contracted in `docs/session-contracts/4.0/`. Continue only through
`start-session`; the resolver owns stage selection and the deterministic
`lifecycle/<sub-version>` branch.

Two topology facts that are easy to misread. Sub-version identifiers keep the
phase narratives' original numbers, so merged bundles absorb adjacent numbers
and the sequence contains deliberate gaps; the resolver orders by table row, not
by arithmetic. Sub-versions 4.0.4.2 and 4.0.4.3 are the only ones whose sessions
each ship their own PR — every other sub-version ships one PR for the
sub-version.

`docs/CODE_HEALTH_BASELINE.md` and `docs/UPDATE_WATCH_BASELINE.md` remain the
active health and update-watch state. The full scratchpad as it stood at the
3.10→4.0 boundary is preserved byte-for-byte at
`../LGI Tools Document Archive/pre-4.0/SCRATCHPAD_3.10_pre-compaction.md`.

## Durable homes

- Repository rules and invariants: root and scoped `AGENTS.md` files, plus the
  owning workflow or schema under `docs/workflows/`.
- Deferred, unassigned work: `docs/backlog.md`.
- User-facing and internal ship history: `content/changelog/` and git history.
- Per-session planned delivery truth from the 3.10 binding floor:
  `../LGI Tools Document Archive/versions/3.10/session-as-built/`.
- Architecture rules and generated dependency view: `.fallowrc.json`,
  `src/AGENTS.md`, and `docs/architecture-map.md`.
- Older scratchpad context: the `pre-3.8/` and `pre-4.0/` document-archive
  folders.

## Open operator carry-forwards

- `DISCORD_ALERT_WEBHOOK_URL` is still optional and unset unless configured
  separately for Production and Preview. It drives price-degradation alerts;
  telemetry still records when delivery is skipped.
- Vercel Speed Insights remains wired but not enabled on the current plan.
- The daily update-watch routine remains paused until the operator explicitly
  chooses to unpause it.

## Working notes

- The repository pins the pnpm release that enforces its seven-day
  `minimumReleaseAge`. Use the pinned package manager when changing the
  lockfile; an older global pnpm can parse the setting without enforcing it.
- Do not rebuild a shipped-version ledger here. Use changelog, git, archived
  lifecycle records, and agent memory for historical forensics.
- Promote any new load-bearing fact to its canonical guide, workflow, schema,
  checker, test, or backlog entry instead of growing this file indefinitely.
