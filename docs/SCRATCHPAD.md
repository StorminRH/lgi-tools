# SCRATCHPAD — LGI.tools

> Short cross-session memory. Keep this skimmable in about one minute. Close-out
> owns session-boundary upkeep (`docs/workflows/close-out.md`). During an
> in-flight planned session, `start-session` also maintains under **Now**:
> **OW progress** (`k/n complete` — next step title, or `n/n complete —
> awaiting close-out`), **OW completed** (one short line per finished step),
> and **Next-agent notes**. Collapse those mid-session OW rows at close-out.

## Now

- **CURRENT:** session **4.0.4.3.3** on `lifecycle/4.0.4.3` (signature
  viewer / site-card hosting / observation proof; plan Approved).
- **OW progress:** `4/5 complete` — next: UX gate (G-1).
- **OW completed:**
  - OW-1 Land the four 4.0.4.3.2 corrections — `linkKnowledgePatch` carries
    lifeStage/lifeStageObservedAt (timestamped Unset both directions),
    `MAP_SCANNER_EDITOR_CLASS` caps max-height above the narrow-stack anchor,
    lifecycle probe re-stamps before identical re-paste, automatic-jump probe
    asserts static-stub readouts; focused mapScan+windows + verify green
    (`11bae01c`).
  - OW-2 Standalone site-card presentation — `SiteCard` `presentation`
    catalogue|standalone (no Collapsible/hover/extras on standalone; hover
    owned by presentation not alignment); `/sites/[id]` + widget adopt it
    with `max-w-reading` (G-1 may retune); focused SiteCard+page + verify
    green (`b24d11e8`).
  - OW-3 Signature viewer primitive — host `panelTarget` union
    (connection|site); shared `ScannerAnchoredPanel` chrome; catalogue
    `siteIdForSiteName` + seed drift test; `MapAccessGate`/`MapChrome` seed
    the index on atlas (no AppHeader); site view not canEdit-gated;
    focused signatures+lookup+layout + verify green (`f1411cb6`).
  - OW-4 Observation collection proof — proof-only, no gap; SC-3/SC-4 green
    across jump-resolver (confirmed/human/jump-verified), signature-elimination
    (assumed + vacate), mapJump (`destinationProvenance: jump-verified`), and
    wh-observations real-Postgres (five-column privacy, correction-in-place,
    K162/hour-coarse checks); ranking/provenance chrome untouched; verify
    green (commit SHA follows).
- **Next-agent notes:** (1) OW-5 owns ux-check over `/atlas` + `/sites/[id]`
  and the G-1 operator pause (site viewer, standalone measure, full signature
  flow) — do not open the PR before the disposition is recorded. (2) Standalone
  measure is `mx-auto w-full max-w-reading` around the card only — RelatedSites
  stays full detail width; G-1 may retune. (3) Atlas seeds `setSiteSearchIndex`
  via MapChrome — do not assume AppHeader. (4) `defaultOpen` is gone from
  SiteCard — catalogue always lazy-collapses. (5) lifeStage carry treats
  “never recorded” as both fields nullish; timestamped Unset on target wins.
  (6) Narrow-stack max-h matches the panel’s `bottom-[…]` recipe; md parks
  with `md:max-h-[calc(100dvh-2rem)]`. (7) HC-2 superseded by D-B;
  ranking/provenance chrome stay OOS (PD-2/PD-3). (8) Neon `wh_observations`
  writers remain jump-resolver + signature-elimination only; Convex stamps
  connection provenance and never inserts the corpus.
- **Durable 4.0.4.3.2 gotchas:** (1) G-1 identity: authored/halo keep the
  neutral name above the disc and colored class/security inside; dock/summary
  keep one name + one colored accessory; ghosts put sig id or static code
  above and destination class inside; untyped/K162 ghosts stay blank. (2)
  Elimination toasts name exact `signatureIds` (`<id> has been identified.` /
  natural-list plural). (3) Atlas admin auth stays inside Suspense with
  `await connection()` before `checkAdmin()`; `atlas/page.tsx` keeps
  `instant = false`. (4) Link deductions carry `expectedTypeCode` and refuse
  when the live stub type diverges; human mass/size/death/lifeStage on the stub
  merge onto the resolved row before the stub deletes (Unset is timestamped).
  (5) Observation logging is
  independent of statics — unavailable statics disable deductions only; human
  identities still reconcile through `reconcileWhObservations`. (6) Manual
  type cascade uses the attributable endpoint (`typedSide === 'to'` →
  `toSystemId`). (7) Signature Editor stacks above the scanner on narrow
  viewports (`MAP_SCANNER_EDITOR_CLASS`); screen-space anchor — do not
  re-bind to canvas transforms. (8) `setConnectionTypedSide` remains without a
  client caller; `typedSide` is still written by mapScan/mapFixtures and read
  by mapJump. (9) Statics presentation is derived
  (`static-stub:<system>:<code>:<ordinal>`); paste stubs stay usable when
  statics/codex fail. (10) Probe paste needs `seedTrackedLocationFixture`
  re-stamp before every paste including identical re-paste; chrome probe needs
  a populated map.
- **Prior session (4.0.4.3.1, shipped in PR #377):** close-out adversarial
  round accepted ~20 root causes, all fixed on-branch — headline fixes:
  paste-revive scoped to a stub's own lifetime (never `runBranchRestore` from
  `applyScan`; dead ceiling / expired undo / conflicting group stay inert);
  ceiling sweep re-ranged onto live-only `by_deleted_death_latest` with
  per-row failure isolation; missing prompt keyed to the paste-target system,
  not the chain root; row-editor type entry routes `applyWormholeType` for
  resolved rows; removal/restore uses exact per-ID lookups past the
  whole-system bound; list/stub removals ledger restorable
  `signatures_removed`/`signatures_restored` events.
- **Durable 4.0.4.3.1 gotchas:** (1) The account-level paste gate needs live
  feed coverage — on probe maps the tokenless engine wipes the synthetic
  pilot's `coveredCharacterIds` within ~30s, so probes re-stamp via
  `seedTrackedLocationFixture` (same transition epoch, fresh `feedFreshAt`)
  before every paste after the first. (2) The chrome probe needs a POPULATED
  map (`waitForWindowMap` wants ≥2 nodes) — run it on the lifecycle probe's
  map after that one-shot run. (3) `runCollapse`/`runBranchRestore` throw only
  BEFORE their first write — the sweep's per-row catch depends on that
  decision-then-write shape; keep it. (4) Independent stub tombstones must
  never share a collapse's stamp: single-row tombstones stamp before resolved
  collapses so `uniqueTombstoneStamp` (read-your-writes) avoids them.
  (5) Convex index `eq(field, null)` does not match absent fields — the sweep
  reads both `undefined` and `null` live representations.
- **Probe gotchas (durable):** `pnpm e2e:seed` resets `user.role` — re-grant
  ADMIN to `e2e-pilot`; seed disposable maps with a fresh synthetic affiliation
  stamp (`affiliation_refreshed_at = now()` for character 9000001); lifecycle
  probe is one-shot — new map per run.
- **Durable tooling gotcha (Playwright / Deployment Protection):** never put
  `VERCEL_AUTOMATION_BYPASS_SECRET` in Playwright `extraHTTPHeaders` — that
  sends it to every third-party origin. Use
  `scripts/ux-remote-auth.mjs` `installOriginScopedBypass` only. Captures and
  `auth-storage.json` stay under gitignored `docs/ux-check/captures/`.
  `ensure-vercel-automation-bypass.py` is bootstrap/rotate only once
  `.env.local` is seeded.
- **Shipped 4.0.4.2.3:** every system is a declared 120×88
  widget frame; edges and followers share frame geometry; tracked pilots
  render honest presence in the frame, dock, and summary; authored k-space
  exits derive a bounded deterministic halo; a world-anchored canvas fogs
  provisional content and reveals authored transitions; off-map pilots point
  out along the visible gate path. G-1 pinned halo depth `1+1`, per-exit cap
  `10`, total cap `150`, reveal radius `280`, stroke `120`, opacity `0.95`,
  and dynamic fog. The folded hidden-tab checklist is complete.
- **4.0.4.2.3 close-out review:** holistic + ownership + interface +
  reliability reviewed `ead66468...8439ceaa` (digest `34f5ee0671d7bda7`);
  eight accepted root causes were fixed in `a7246e26`, nothing contested,
  and the operator rejected restoring auto-layout description copy. Final
  probes: halo 12/12, fog layering 19/19, background tracking 21/21, window
  tracking 9/9, and 50-node motion glide 9/9 (49 movers, 13,585 edge samples,
  p50 8.3 ms / p95 25.0 ms).
- **Durable 4.0.4.2.3 gotchas:** (1) Halo pins live in `halo-model.ts` and fog
  pins in `fog-model.ts`; dev dials start at those values and remain for later
  retuning. (2) Presence freshness is the quantized sibling
  `mapTracking.feedFreshness` query, gated per character by
  `coveredCharacterIds`; a fresh location `observedAt` also proves coverage.
  Do not put the hot subject stamp back into `forMap`. (3) Every React Flow
  node wrapper stays pointer-inert; only visible name/disc chrome opts back in.
  (4) `endpointFrame` / `frameCenter` own edge, camera, and follower geometry;
  frame dimensions stay declared on node objects. (5) FogLayer remains the
  direct ViewportPortal child at z:-1; halo nodes are never draggable and an
  authored upgrade must `stripDerivedControls`. (6) The page-settings
  `description` slot is retired end-to-end; do not restore auto-layout subtext.
  (7) Shared mapper utilities own `mulberry32` (`lib/prng.ts`) and `pairKey`
  (`lib/pair-key.ts`); outbound paths use the shared multi-source BFS.
- **Durable probe gotchas:** `pnpm e2e:seed` resets `user.role`, so re-grant
  `ADMIN` after seeding; background/halo/fog probes need a fresh disposable
  map; `pnpm map:replay -- --user e2e-pilot --chain 33` requires the bare
  separator; shortened `NEXT_PUBLIC_AFK_*` G-1 overrides must not drive the
  production-threshold background probe; path-data readers must accept
  scientific notation. The live tokenless engine may overwrite fixture
  `coveredCharacterIds` with `[]` by design — fresh `observedAt` coverage is
  the honest fallback, not an engine bug.
- **Deferred / unscheduled:** the tiny drain-end wipe (retire remaining
  `onlineStatus` schema literals, `characterOnline`, and keeper/GC) waits for
  production rows to drain. The behavioral checklist itself is complete and
  carries no deferral.
- **Shipped 4.0.4.2.2:** merged unresolved-signature/connection
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
  layout owns positions; re-enabling releases user placements — description
  subtext removed at 4.0.4.2.3 G-1 by operator direction).
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
across 24 sessions — is the `## Status` table there. Every session is
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
