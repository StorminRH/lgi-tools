# SCRATCHPAD — LGI.tools

> Short cross-session memory. Keep this skimmable in about one minute. Close-out
> owns session-boundary upkeep (`docs/workflows/close-out.md`). During an
> in-flight planned session, `start-session` also maintains under **Now**:
> **OW progress** (`k/n complete` — next step title, or `n/n complete —
> awaiting close-out`), **OW completed** (one short line per finished step),
> and **Next-agent notes**. Collapse those mid-session OW rows at close-out.

## Now

- **CURRENT / NEXT:** session **4.0.4.1.2** complete — sub-version
  **4.0.4.1** done (both sessions); close-out is delivering the single
  sub-version PR #353 from `lifecycle/4.0.4.1` (G-1 ACCEPT recorded
  2026-08-04). Next planned work: 4.0.4.2 through `start-session` after
  merge.
- **Shipped 4.0.4.1 (both sessions):** gated chain authoring (home /
  add-from-node / connection card), codex connection intelligence, death-window
  lifetime model, mass layers 1+3, unified sever/collapse pathway with
  shared-stamp undo, `src/mapper/log/` despawn ledger, 15-minute chain purge
  cron, and OW7 map-chrome polish. Ledger detail: changelog `v4.0.4.1`,
  as-builts under `docs/session-as-built/4.0/`.
- **Durable 4.0.4.1.2 gotchas:** (1) `deathWindowFrom` in
  `src/data/maps/connection-lifetime.ts` is the ONLY owner of the
  stored-pair→window predicate — server validation, optimistic patches, and
  card rendering all consume it; do not re-implement locally. (2)
  `restoreSeveredBranch` refuses `ENDPOINT_TOMBSTONED` when a later sever
  tombstoned a cut endpoint outside the shared-stamp set — the fail-closed
  guard exists because a live connection with a dead endpoint wedges
  `severConnection` (`INVALID_MAP_TOPOLOGY`) permanently after the purge cron.
  (3) `mapConnections.eolAt` is vestigial (superseded mark-EOL design, always
  null); lifetime truth is the `deathEarliestAt`/`deathLatestAt` pair. (4)
  `mapEvents.actor` display-name retention rides the ledger's 7-day
  self-expiry, a recorded exemption in `docs/CONVEX.md` — not the `/n`
  teardown door. (5) Wrapping a `<label>` around a Base UI Select forwards
  caption clicks and springs the dropdown (the CustomStructureBuilder gotcha
  recurred in `connection-fields.tsx`); use `<div>` + `ariaLabel`.
- **4.0.4.1.1 gotchas:** (1) Optimistic destination systems must
  `insertAtBottomIfLoaded` — `resolveRoot` is `facts.systems[0]`. (2) Home
  prompt gates on filtered `liveSystemCount`, not merged canvas state. (3)
  Public `mapFixtures.upsertSystem` removed — use `placeSystemFixture` /
  `mapAuthoring`. (4) Access CLI:
  `pnpm map:project-access project|teardown <mapId>` — omit bare `--`. (5)
  Edge-card selects may sit outside the CSS viewport after camera settle —
  probe via `[data-map-window="connection-details"]`. (6) G-1 camera fit
  `CAMERA_FIT_MAX_ZOOM = 0.75`; typeahead unique codes for SDE clone typeIds
  (C729/F216/J244) with full typeId wire payload preserved.
- **Local review maps:** blank
  `4f5dd5e0-97f4-42c2-97aa-2fee04756665`; populated
  `4f47c80a-c40b-4795-8831-faa4c7c41426`.
- **Key paths:** `docs/session-contracts/4.0/4.0.4.1.2.md`,
  `src/mapper/authoring/`, `convex/mapAuthoring.ts`.
- **Durable 4.0.3.3 gotchas:** (1) Window layer reads selection/titles through
  equality-stable React Flow store selectors — never the host's hot `nodes`
  array (PD-4). (2) Probe `WINDOW_STORAGE_KEY` in `docs/ux-check/lib` must
  stay byte-identical to `persistence.ts` (docs cannot import src). (3)
  Floating resize is a pointer-only `data-map-window-resize` grip, not a
  button. (4) As-built recorded G-1 layout supersession: left-rail dock,
  top-right controls, portrait beside Atlas menu, title-bar drag.
- **Durable 4.0.3.2.1 gotchas:** (1) Reveals and collapses must be ONE Convex
  transaction (`placeJumpFixture`/`collapseJumpFixture`) — split writes make a
  system surface unattached ("nowhere") and then hop, because each transaction
  is its own consistent client transition; 4.0.4.2's auto-mapper must keep the
  transaction boundary but use upsert semantics for re-observed jumps. (2) Edge
  truth recomputes in the merge commit while node truth lags one commit (sync
  effect) — the motion host keeps a `knownEdges` previous-merge memory for
  ghost capture; refactoring ChainHost's edge memo must preserve a capture
  source. (3) React Flow writes `pointerEvents` INLINE on node wrappers
  (truthy once `onNodeClick` is forwarded) — a class rule can never make a
  node inert; ghost snapshots carry `style: { pointerEvents: 'none' }`.
  (4) Animated viewport promises NEVER settle when superseded — camera flights
  are generation-tracked; the drag abort is a zero-duration
  `setViewport(getViewport())`. `setCenter` defaults to maxZoom: always pass
  the current zoom explicitly. (5) A `system-moved` landing inside a node's
  birth window relocates instantly (no glide) — the split-merge backstop.
  (6) The G-1-ratified stylesheet fallbacks in `[data-map-motion-scope]` are
  test-pinned to `DEFAULT_MOTION_CONFIG`; retune both together.
  (7) The heavy collapse exit triggers on the wormhole-collapse batch
  signature — a system departing TOGETHER WITH a connection in one merge
  (what `collapseJumpFixture` emits); a bare system removal stays ordinary.
  The 4.0.4.1 unified collapse pathway owns evolving this trigger.
- **Durable 4.0.3.1.2 gotchas:** (1) DOM `style.transform` read-back carries
  ~1e-4px float32 serialization noise per engine — cross-client position
  comparisons must use `docs/ux-check/lib/read-node-positions.mjs` (0.01px
  tolerance), never string equality; JS-side byte-identity is pinned by the
  digest fixture. (2) The probe runner now supports `--engine`,
  `--storage-state` (auth applies only to `requiresAuth` probes) and
  `--capture-storage-state` (headed EVE SSO login capture); Playwright firefox
  is installed locally. (3) `.fallowrc.json` has a declared `scripts → mapper`
  allow edge for the replay tool; the architecture-map census is 24 zones /
  117 permissions / 118 edges. (4) `pnpm map:replay` reuse of `--map` after an
  interrupted run accumulates duplicate connections (inserts are not
  idempotent) — seed fresh with `--user`; replay maps are disposable.
  (5) `use-layout-kernel.ts` worker degradation paths are inspection-verified
  only (no unit test) — an evidence gap for a future session.
  (6) `MapChain.treeParents` re-runs `deriveChainTree` on the main thread
  (~8µs at 60 systems) — a deliberate recorded exception to the worker story.
- **Post-merge follow-up:** the operator's informal production feel-check of
  the motion layer (behind the admin wall) happens after merge per the
  resolved PD-1 ruling; any surprise is ordinary out-of-bound work.
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

## Working notes

- The repository pins the pnpm release that enforces its seven-day
  `minimumReleaseAge`. Use the pinned package manager when changing the
  lockfile; an older global pnpm can parse the setting without enforcing it.
- Do not rebuild a shipped-version ledger here. Use changelog, git, archived
  lifecycle records, and agent memory for historical forensics.
- Promote any new load-bearing fact to its canonical guide, workflow, schema,
  checker, test, or backlog entry instead of growing this file indefinitely.
