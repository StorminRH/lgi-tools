# SCRATCHPAD — LGI.tools

> Short cross-session memory. Keep this skimmable in about one minute. Close-out
> owns session-boundary upkeep (`docs/workflows/close-out.md`). During an
> in-flight planned session, `start-session` also maintains under **Now**:
> **OW progress** (`k/n complete` — next step title, or `n/n complete —
> awaiting close-out`), **OW completed** (one short line per finished step),
> and **Next-agent notes**. Collapse those mid-session OW rows at close-out.

## Now

- **Durable tooling gotcha (Playwright / Deployment Protection):** never put
  `VERCEL_AUTOMATION_BYPASS_SECRET` in Playwright `extraHTTPHeaders` — that
  sends it to every third-party origin. Use
  `scripts/ux-remote-auth.mjs` `installOriginScopedBypass` only. Captures and
  `auth-storage.json` stay under gitignored `docs/ux-check/captures/`.
  `ensure-vercel-automation-bypass.py` is bootstrap/rotate only once
  `.env.local` is seeded.
- **Deferred to 4.0.4.2.3 by operator ruling (2026-08-07, PR #368):** the
  real-character behavioral validation of hidden-tab tracking merged without a
  dev visual pass. The 4.0.4.2.3 plan/close-out must cover, alongside its own
  fog/live-pilot G-1 gate: alt-tab past the old 60s window with jumps landing;
  ~60s offline probe pacing and login resume; AFK dialog look/feel + dismissal
  resume (dev-shortcut envs `NEXT_PUBLIC_AFK_HIDDEN_AFTER_MS` /
  `NEXT_PUBLIC_AFK_PROMPT_TIMEOUT_MS`). Headless background-jump probes need
  no real character: compose `convex/mapFixtures.ts`
  (`seedTrackedLocationFixture`/`advanceTrackedLocationFixture`) with the
  `atlas-afk-gate` probe's virtual-clock + hidden-visibility technique.
  Presentation note: `mapTracking.forMap` exposes only last-CHANGE
  `observedAt`, so paused/stalled tracking renders like a stationary pilot —
  live-pilot presentation should surface staleness honestly. Also pending:
  the tiny drain-end wipe PR (drop `onlineStatus` schema literals +
  `characterOnline` + keeper/GC) once prod rows drain post-#368.
- **CURRENT / NEXT:** session **4.0.4.2.3** (fog, halo, pilot presence) is in
  Ordered work on `lifecycle/4.0.4.2` (plan
  `docs/session-plans/4.0/4.0.4.2.3.md`; 4.0.4.2.2 merged as PR #365).
- **OW progress:** `3/5 complete` — next: Ordered work step 4, Fog layer.
- **OW completed:**
  - OW1 — widget-frame node primitive: `SystemNode.tsx` (frame 120×88 declared
    data-side, header name, centered disc, widget rail), `edge-geometry.ts`
    frame-box clipping + `pointAlongChainLink`, camera fit/focus and edge
    follower on frame centers, follower/focus routed through the shared
    `endpointFrame`/`frameCenter` owner. Proof: edge-geometry 17 + SystemNode
    13 units, mapper 47 files / 400 tests green, full verify green (fallow
    clean, 14 changed files), primitive-checker CLEAN after 2 corrections.
    Commit: 26b94263.
  - OW2 — pilot presence with staleness honesty: `presence-model.ts` (pure
    matrix + `PRESENCE_FEED_STALE_AFTER_MS = 180s`, status words, friendly
    rows), `presence-context.ts` + `PresenceProvider.tsx` (forMap read, 30s
    tick, AFK gate ownership moved here), `PilotPresenceBadge` in the frame
    rail, `SystemIntelligenceBody` replacing the placeholder in card + dock,
    `forMap` `feedFreshAt` join (memoized per owner), `mapFixtures`
    subject-freshness stamp (+ optional `feedFreshAt` arg), shared
    `use-entity-names` hook (extracted; CorpJobsBoard is the other consumer),
    `atlas-background-tracking` probe (folded #368: hidden jumps land,
    heartbeat frames stop after AFK pause, stale rendering, resume). Proof:
    presence-model 14 units + convex join/stamp coverage, probe run all 19
    checks green (2026-08-07), full verify green (fallow clean, 38 changed
    files), primitive-checker CLEAN after 4 corrections across 2 rounds.
    Commit: 814be6c2.
  - OW3 — k-space halo through the compass: `halo-model.ts` (pure ring-BFS
    from authored k-space exits over the client adjacency asset; rings 1–2
    drawn / ring 3 fogged, per-exit + aggregate caps, claim-links-first
    emission so the kernel tree attaches at shortest gate distance),
    `use-map-chain.ts` merge seam (memoized on authored key + assets, facts
    append, `layoutPostKey` 4th halo-fingerprint arg, placed halo set
    atomically with the merge), `syncNodes`/`buildEdges` halo passes
    (declared frame dims, draggable:false, fogged ring inert via node style,
    `halo:` edge ids + shared pair claiming, upgrade sheds derived controls),
    SystemNode derived/fogged markers, `pilot-path.ts` +
    `outbound-arrow-context`/`OutboundArrowProvider` + ChainLinkEdge
    EdgeLabelRenderer arrow (CSSOM transform var), context-menu/edge-click
    guards, engine.ts clone dedupe (`takeRetiredRows`). Proof: halo-model 13
    + pilot-path 6 units, mapper 51 files / 479 tests, `atlas-halo`
    two-client probe 12/12 green at final head (identical membership +
    positions, zero non-heartbeat mutations, in-place upgrade with
    map-node-enter on both clients; SC-1/SC-2/SC-4 evidence), full verify
    green (fallow audit exit 0). Primitive-checker CLEAN round 1.
    Commit: see this commit's SHA.
- **Next-agent notes (4.0.4.2.3):**
  - Node dims are DECLARED (`width`/`height` on the node object in
    `syncNodes`) — React Flow v12 renders them as wrapper inline styles, so
    edges/fits/followers see the box before ResizeObserver measurement; halo
    nodes (OW3) must declare the same constants.
  - Frame-center policy has ONE owner: `endpointFrame` + `frameCenter` in
    `src/mapper/canvas/edge-geometry.ts`; node-data display fields have ONE
    owner too: `useNodeDataString` in `src/mapper/windows/node-fields.ts`
    (window titles and the intelligence body both route through it).
  - `SYSTEM_DISC_RADIUS` is gone; the disc is frame-internal presentation.
  - Presence seams: badge/body consume `presence-context.ts` (no Convex
    import chain — SystemNode markup tests need no client); the provider owns
    the AFK gate and `TrackingHeartbeat` consumes it via `useMapPresenceAfk`.
    `forMap` now also reads tracked owners' `syncSubjects` rows, so every
    completed sync run re-pushes forMap to viewers — the intended freshness
    signal (plan interface), noted for perf awareness.
  - G-1 presentation note: the friendlies readout renders as a two-column
    list (`ul`), not a `<table>` — raw tables are lint-banned and StaticTable
    forces a labeled header against the operator's "nothing more" direction.
  - Probe ops: `atlas-background-tracking` needs a FRESH empty `UX_BG_MAP_ID`
    map; seeding one for the synthetic pilot requires stamping
    `characters.affiliationRefreshedAt` first or `projectMapAccess` fails
    transiently (no live ESI identity). Fixture timestamps split on purpose:
    `transitionObservedAt` real time (server capture window), `feedFreshAt`
    virtual now (client staleness).
  - OW4 owns: `src/mapper/fog/fog-model.ts` + `FogLayer.tsx` (world-anchored
    canvas below edges/nodes via `ViewportPortal` + negative zIndex), the
    frame-budget probe at max combined load (SC-6.2), and the MapControls
    dev dials for halo/fog constants ahead of G-1 (`deriveHalo` already
    accepts an injectable `limits` object, so dial wiring is trivial).
  - OW3 seams for OW4: fogged ring-3 nodes carry `data.halo.fogged` on the
    presentation nodes and `data-chain-node-fogged` in the DOM; halo edges
    carry `data.halo` and a both-fogged link is never emitted (halo-model
    guarantees it), so `deriveFogReveals` can trust node flags alone.
    `layoutPostKey` now takes a 4th halo-fingerprint arg — halo membership
    is structural layout input; the assets landing re-posts the kernel.
  - Halo nodes live in ChainHost's controlled node set (selection
    round-trips through `applyNodeChanges`); never draggable; inertness is
    node-level `style.pointerEvents` (ghost precedent — a class can never
    win). The derived→authored upgrade reuses the node id and
    `stripDerivedControls` sheds draggable/selectable/style — spreading a
    retained halo node unchanged would leave an authored system inert.
  - Fallow gotcha: the cognitive cap (15) binds BFS/scan-shaped functions —
    keep per-ring/per-frontier expansion in extracted helpers (deriveHalo,
    derivePilotPath, buildEdges all shipped that shape after a red gate).
    The engine.ts clone group was OW2 scope fallout, deduped via
    `takeRetiredRows`.
  - `atlas-halo` probe ops: fresh disposable map per run —
    `psql: insert into maps (user_id, name) values ('e2e-pilot', ...)`,
    stamp `characters.affiliation_refreshed_at` for character 9000001
    (projection otherwise fails "affiliation refresh failed transiently"),
    `pnpm map:project-access project <id>`, then
    `UX_HALO_MAP_ID=<id> node docs/ux-check/run-probes.mjs
    --storage-state=docs/ux-check/captures/auth-storage.json atlas-halo`.
- **Shipped 4.0.4.2.2 (awaiting merge):** merged unresolved-signature/connection
  model; pure eliminator + statics census; one-transaction Convex jump
  authoring behind two bearer doors; D16 observation slice (five-field Neon
  table, upsert by dedupe key); jump-resolver route; doorbell observer +
  confirm/correct prompt; leads-to hints; odometer-aware mass estimates;
  autosaved atlas map preferences; persistent click-through current-system
  overlay. Close-out adversarial round (holistic+ownership+interface+
  reliability) accepted 18 root causes, all fixed on-branch — headline fixes:
  emission tier now follows the MUTATION's stored provenance (never the
  matcher verdict); statics census counts resolved scanned rows; manual typing
  mints the observation dedupe key; forged `mapTracking` rows can no longer
  veto a genuine scout (joinable-row filter); doorbell gained a 15s timer
  retry + request timeout and a 10-min capture window; account/character purge
  drains `mapJumpBookkeeping` via new `by_character` index.
- **Durable 4.0.4.2.2 gotchas:** (1) `convex-test` serializes top-level calls —
  the Promise-all convergence proof is concurrent-SHAPED, not a deployed OCC
  collision. (2) Emission gating rule (HC-3): any observation write must key
  its tier off `destinationProvenance` returned BY the mutation; a converged
  pair is a different document than the matcher's candidate. (3) The census
  pool is `scannedTypeCodes` (resolved rows included, `typedSide:'to'`
  excluded) — the unresolved candidate pool is the wrong census input by
  construction. (4) The current-system dock overlay is `pointer-events-none`
  by contract (nothing interactive inside); probes assert click-through, and
  window probes drive prefs through the portrait menu (`auto layout`,
  `camera follow`, `click focus` — server-authoritative for signed-in probe
  accounts, so localStorage seeding does NOT survive reconcile). (5) The
  floating-window machinery (drag/resize/pop-out, `WindowRect`,
  `drag-resize.ts`) is fully DELETED with the review round — a future float
  surface rebuilds from git history rather than inheriting an unreachable
  path; the pointer-only-grip precedent stays recorded in the 4.0.3.3.1
  as-built. (6) Atlas map-lock pref key is `atlas.autoLayout` (ON = computed
  layout owns positions; re-enabling releases user placements — disclosed via
  the page-settings `description` slot).
- **Shipped 4.0.4.2.1:** `EVE_SCOPES` → 14 (`read_location`/`read_ship_type`);
  `mapTracking` opt-in registry + `characterLocation` payload with full
  teardown matrix; `characterLocation` engine dataset (registry ∩ enum,
  ship-on-change, 304 zero-write); 5s chain-on-success cadence
  (`chainOnSuccess`/`rateKeyScope` opt-in config, `chainDispatch`); pure
  `classifyMovement` decision table; map-side `TrackingControls`. Ledger
  detail: as-built under `docs/session-as-built/4.0/`.
- **Durable 4.0.4.2.1 gotchas:** (1) Continuity (`prevFresh`) reads the
  subject's `coveredCharacterIds` (this run's clean samples, 304s included) —
  NEVER `syncedCharacterIds` (the tracked/hint set); the chain-on-success
  yield gate reads the same field, so a dataset opting into `chainOnSuccess`
  must stamp it or it never chains. (2) Chain hops must stay jitter-free
  (`computeChainBoundary`); jitter on a chained subject silently degrades to
  the 30s scan. (3) `forMap` joins location strictly by the tracking row's own
  `(userId, characterId)`; reads are capped and `setTracking` enforces
  `TRACKED_CHARACTERS_PER_MAP_USER_CAP`. (4) `mapTracking` is DURABLE
  user-authored state riding the sanctioned Convex durability exception
  (schema-header carve-out; purge contributor tier `durable`); the
  purge-map-access door sweeps it as the account-purge backstop because the
  best-effort HTTP door can fail. (5) Eligibility is per-character via
  `canSyncLocation`; keep online out of `LOCATION_SYNC_SCOPES`. (6)
  `observedAt` is last-change time (304s never touch the doc); freshness
  reads the subject's `lastFinishedAt`. (7) Keep the pure
  `src/data/maps/movement-classification.ts` seam client-side; never move
  geography into Convex. (8) Fallow may warn on
  onlineStatus↔characterLocation clone groups; accepted canary mirroring,
  not a waiver target.
- **4.0.4.2.2 direction (operator):** (1) k-space handling is revised so a
  visited k-space system is authored; reconcile against the successor
  contract's wormhole-exits-only wording during planning, not by silent
  execution divergence. (2) Hole matching is signature-first and asks an
  informed confirmation question from available signature evidence; ambiguity
  is never auto-asserted. (3) A `re-anchor` surfaces downstream as an orphaned
  anchor that regraphs and may reconnect, never as an invented path.
  (4) Capsule/death fine-tuning stays deferred; the shipped
  non-adjacent-capsule verdict remains `re-anchor` until decided explicitly.
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
  array (PD-4). (2) Current-system dock is a persistent CLICK-THROUGH overlay —
  no float, no localStorage window record, no close (`persistence.ts` and the
  whole drag/resize/pop-out machinery removed in 4.0.4.2.2). (3) Any future
  float surface rebuilds from git history; keep resize a pointer-only grip,
  not a button (4.0.3.3.1 as-built precedent). (4) As-built G-1 layout from
  4.0.3.3 was superseded again in 4.0.4.2.2: dock top-left overlay, chrome
  top-right above the window layer (z-dropdown), dials bottom-left above the
  audit log (dev-only).
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
- High-signal Vitest deletion bar:
  `docs/contributing/testing-principles.md`. Local `pnpm verify` with the db
  harness reachable remains the gate of record when real-Postgres suites are
  the sole falsifier.
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
