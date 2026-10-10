# Wave 3: src/lib primitives: collections, math, async, errors, browser

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 2: Tooling and test-harness foundations](wave-02-tooling-and-test-harness-foundations.md) · [Index](README.md#roadmap) · [Wave 4: Formatting, dates and names have one home](wave-04-formatting-dates-and-names-have-one-home.md) →

Land the generic lib helpers that waves 4–15 consume, each with its first real consumers:
- math, with roundIsk homed in lib/math
- groupBy and getOrInsertComputed
- idsKey and sameItems
- mapConcurrent
- graph BFS
- errorMessage and FailureResult
- isTimeoutError, then retry.ts (sleep, readWithRetries, absorbing warmNeon)
- dependency timing
- bestEffort replacing swallow, then sendOpsAlert
- the text humaniser
- search-params
- useNow
- web-storage
- peer-channel
- postBeacon

Additions to src/lib/array.ts (P101, P102, P112) and src/lib/failure.ts (P151, P249) land in sequence.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | [P105](#p105) | Add src/lib/math.ts (clamp with min-wins, clamp01, clampPct, roundTo, roundIsk) and delete the private copies | generic-utility | S | low | low | — |
| ☑ | [P096](#p096) | Export roundIsk from lib/format/isk and drop the three private copies and the inline pair | formatting | S | low | low | [P105](#p105) |
| ☑ | [P101](#p101) | Add groupBy and getOrInsertComputed to src/lib/array.ts and replace the hand-rolled bucket and get-or-create loops | generic-utility | M | low | medium | — |
| ☑ | [P102](#p102) | Promote eligibleIdsKey to sortedUniqueIds / idsKey / parseIdsKey in src/lib/array.ts and delete the local copies | generic-utility | S | low | low | — |
| ☑ | [P112](#p112) | Add sameItems and sameFields shallow-equality helpers to src/lib | generic-utility | S | low | low | — |
| ☑ | [P100](#p100) | Add mapConcurrent to src/lib/fan-out.ts and replace six hand-rolled worker pools | generic-utility | M | low | medium | — |
| ☑ | [P104](#p104) | Use the existing mapByIdDroppingNulls at the five hand-rolled id fan-outs instead of adding mapById | generic-utility | S | low | low | — |
| ☑ | [P137](#p137) | Add src/lib/graph.ts (Neighbours, breadthFirst, pathTo) and route trade-hubs, pilot-path and chain-collapse through it; leave halo's budgeted per-exit expansion as is | generic-utility | S | low | low | — |
| ☑ | [P151](#p151) | Add errorMessage(unknown) to src/lib/failure.ts and route the four copies plus errorCode's fallback through it | error-handling | S | low | low | — |
| ☑ | [P249](#p249) | Move FailureResult next to AppFailure in lib/failure and use it for the pass/fail guard unions | contracts-validation | S | low | low | — |
| ☑ | [P145](#p145) | Promote hasTimeoutAbort to a chain-aware isTimeoutError in lib and use it in every timeout classifier | error-handling | S | low | medium | — |
| ☑ | [P140](#p140) | Move readWithRetries and a shared sleep into src/lib/retry.ts, let withColdStartRetry absorb warmNeon, and share the planner build-location read | error-handling | M | low | medium | [P145](#p145) |
| ☑ | [P126](#p126) | Time dependencies through one performance.now helper and stop ESI double-counting Redis | generic-utility | S | low | medium | — |
| ☑ | [P130](#p130) | Retire transport/cron swallow and route log-and-continue side effects through lib bestEffort | generic-utility | S | low | low | — |
| ☑ | [P173](#p173) | Route every ops alert through one private sendOpsAlert in lib/alerts that rejects non-2xx webhooks | server-pipeline | S | low | medium | [P130](#p130) |
| ☑ | [P128](#p128) | Add one sentence-case identifier humaniser in lib/format and use it for label fallbacks | generic-utility | S | low | low | — |
| ☑ | [P129](#p129) | Patch search params through one lib helper, and build the post-create link with atlasMapHref | generic-utility | S | low | low | — |
| ☑ | [P047](#p047) | Add a shared useNow clock hook in src/lib for the four interval tickers | react-hook | S | low | low | — |
| ☑ | [P226](#p226) | Extract safe web-storage helpers and a stored MRU list into src/lib/web-storage.ts (fixes the unguarded setItem in search recents) | client-data | M | low | medium | — |
| ☑ | [P115](#p115) | Extract the BroadcastChannel peer-link lifecycle into src/lib/peer-channel.ts | generic-utility | S | low | low | — |
| ☑ | [P066](#p066) | Extract postBeacon (sendBeacon with keepalive-fetch fallback) into src/transport | client-data | S | low | low | — |

<a id="p105"></a>

## P105: Add src/lib/math.ts (clamp with min-wins, clamp01, clampPct, roundTo, roundIsk) and delete the private copies

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 production lines from deleted private helpers and inline expressions, +15 for lib/math.ts, +35 for tests
- **Depends on:** —

**Problem.** The same numeric helpers are declared privately across mapper, features, data, platform/esi, composition and app:
- clamp: private in editor-leader, follower-model and scoreboard/keys, as a closure in ScannerAnchoredPanel, and inline in map-controls-model, wormhole/motion, npc-name-col and fog-painter.
- clamp01: private in market-score, inline in tween-model and fog-painter.
- clampPct: private and identical in job-state and skill-queue/progress, inline in scanner-row-cells and esi-view.
- Cent rounding `Math.round(v*100)/100`: roundIsk in plan, valuation and demo-board, roundTo2 in build-batch, round in leader-path, and inline twice in board-assemble.

The copies are written with two argument orders. They agree on every reachable input, but a reader cannot tell which inverted-range rule is intended.

**Verifier revision.** The core holds. clampPct is copied identically in two features plus two inline copies. roundIsk has three private copies, plus roundTo2 and an inline pair. There are four private clamp declarations and about seven inline nested min/max clamps. Every consumer may import lib. Three parts of the proposal are wrong or not worth doing. (1) The 'drift' between clamp copies is not a live bug. follower-model guards maxLeft/maxTop with Math.max(padding, ...) at 227-228, ScannerAnchoredPanel guards maxTop with Math.max(CARD_EDGE_PX, ...) at 118, and keys.ts passes constants 1..MAX, so none of the 'hi wins' copies can ever see an inverted range. min-wins is still the right shared rule, because the copies that do invert (editor-leader, tooltip-placement and npc-name-col) all want min to win. (2) elapsedPct is dropped. job-state has a paused branch and an end<=start->0 rule. skill-queue interpolates SP and only falls back to the time fraction after it has already split done/pending. Only clampPct is actually shared. (3) clampLevel is dropped from lib. clampTe and clampMe floor values and fall back on non-finite input, which is blueprint-level semantics. te-overrides already delegates to me-overrides, so any merge stays inside the feature. I added sites the finders missed: fog-painter 82 and 122, wormhole/motion 21, npc-name-col 22, and leader-path 6-8, which does the same 2-decimal rounding.

**Sites (21).**

- [`src/mapper/signatures/editor-leader.ts:38-41`](../../src/mapper/signatures/editor-leader.ts#L38-L41) — clamp with an explicit high<low -> low guard; called at 73-77 and 85-89 with panel bounds that can invert
- [`src/mapper/windows/follower-model.ts:86-88`](../../src/mapper/windows/follower-model.ts#L86-L88) — clamp, hi wins; callers at 227-230 pre-guard max with Math.max(padding, ...), so it never inverts
- [`src/platform/esi/scoreboard/keys.ts:21-31`](../../src/platform/esi/scoreboard/keys.ts#L21-L31) — clamp(n, 1, MAX constant); never inverts
- [`src/mapper/signatures/ScannerAnchoredPanel.tsx:118-119`](../../src/mapper/signatures/ScannerAnchoredPanel.tsx#L118-L119) — clamp closure; maxTop is pre-guarded by Math.max(CARD_EDGE_PX, ...)
- [`src/mapper/canvas/map-controls-model.ts:34-43`](../../src/mapper/canvas/map-controls-model.ts#L34-L43) — clampStepped inlines the clamp at line 40; keep the function and call clamp inside it
- [`src/mapper/canvas/wormhole/motion.ts:21`](../../src/mapper/canvas/wormhole/motion.ts#L21) — inline clamp(elapsed, 0, 0.05)
- [`src/features/wormhole-sites/components/npc-name-col.ts:22`](../../src/features/wormhole-sites/components/npc-name-col.ts#L22) — Math.max(MIN_NAME, Math.min(x, available)): a deliberate min-wins clamp, because available can drop below MIN_NAME
- [`src/mapper/fog/fog-painter.ts:82`](../../src/mapper/fog/fog-painter.ts#L82) — inline min-wins clamp(bucket, 0.02, budgetCap)
- [`src/mapper/fog/fog-painter.ts:122`](../../src/mapper/fog/fog-painter.ts#L122) — inline clamp01
- [`src/mapper/motion/tween-model.ts:53`](../../src/mapper/motion/tween-model.ts#L53) — inline clamp01 of the elapsed fraction
- [`src/data/industry-math/market-score.ts:51-53`](../../src/data/industry-math/market-score.ts#L51-L53) — private clamp01 (ternary form); used at 72, 84 and 98
- [`src/features/industry-jobs/job-state.ts:18-25`](../../src/features/industry-jobs/job-state.ts#L18-L25) — private clampPct, identical to skill-queue's
- [`src/features/skill-queue/progress.ts:15-20, 33`](../../src/features/skill-queue/progress.ts#L15-L20) — private clampPct, identical
- [`src/mapper/signatures/scanner-row-cells.tsx:31-34`](../../src/mapper/signatures/scanner-row-cells.tsx#L31-L34) — inline 0-100 clamp
- [`src/app/(site)/admin/esi/esi-view.ts:20-23`](../../src/app/%28site%29/admin/esi/esi-view.ts#L20-L23) — inline 0-100 clamp
- [`src/features/character-sheet/plan.ts:85-87, 121-122`](../../src/features/character-sheet/plan.ts#L85-L87) — roundIsk
- [`src/features/net-worth/valuation.ts:83-85, 145-154`](../../src/features/net-worth/valuation.ts#L83-L85) — roundIsk on persisted net-worth fields
- [`src/composition/board/demo-board.ts:328-330`](../../src/composition/board/demo-board.ts#L328-L330) — roundIsk
- [`src/composition/board/board-assemble.ts:485-486`](../../src/composition/board/board-assemble.ts#L485-L486) — inline cent rounding of the net-worth snapshot
- [`src/features/industry-planner/build-batch.ts:56-58, 67`](../../src/features/industry-planner/build-batch.ts#L56-L58) — roundTo2 removes float noise from material quantities before Math.ceil; same arithmetic, but not ISK
- [`src/mapper/windows/leader-path.ts:6-8`](../../src/mapper/windows/leader-path.ts#L6-L8) — round(): 2-decimal rounding of SVG coordinates

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/chart/tooltip-placement.ts:8`](../../src/components/ui/chart/tooltip-placement.ts#L8) — ui zone has allow [] so it cannot import lib; keeps its own min-wins clamp
- [`src/components/ui/qty-ring.tsx:14`](../../src/components/ui/qty-ring.tsx#L14) — ui zone; cannot import lib
- [`src/components/ui/chart/chart-frame.tsx:34`](../../src/components/ui/chart/chart-frame.tsx#L34) — ui zone; cannot import lib
- [`src/features/industry-planner/te-overrides.ts:5-8`](../../src/features/industry-planner/te-overrides.ts#L5-L8) — clampTe floors and falls back on non-finite input: blueprint-level semantics, not a generic clamp. If anything, merge it with clampMe inside the feature
- [`src/features/industry-planner/me-overrides.ts:3-6`](../../src/features/industry-planner/me-overrides.ts#L3-L6) — clampMe; same as above
- [`src/features/industry-jobs/job-state.ts:10-21`](../../src/features/industry-jobs/job-state.ts#L10-L21) — the elapsed-percent logic has paused and end<=start rules that skill-queue lacks; only clampPct is shared
- [`src/features/skill-queue/progress.ts:10-16, 22-35`](../../src/features/skill-queue/progress.ts#L10-L16) — SP interpolation with a status split; not the same as jobProgress
- [`src/mapper/canvas/edge-geometry.ts:117-118`](../../src/mapper/canvas/edge-geometry.ts#L117-L118) — slab-intersection min/max, not a clamp
- [`convex/mapChainPage.ts:8`](../../convex/mapChainPage.ts#L8) — Convex pagination clamp; it could adopt lib clamp (convex may import lib) but is left out of scope

</details>

**Home.** `src/lib/math.ts (new). Test file src/lib/math.test.ts, beside it as in the other lib modules.`

**Boundary check.** Home zone is lib, whose rule allows only config; math.ts imports nothing. Consumers and the rules that permit lib:
- mapper (editor-leader, follower-model, ScannerAnchoredPanel, map-controls-model, wormhole/motion, fog-painter, tween-model, scanner-row-cells, leader-path): mapper allow includes lib.
- features (job-state, skill-queue/progress, character-sheet/plan, net-worth/valuation, industry-planner/build-batch, wormhole-sites/npc-name-col): features allow includes lib.
- data/industry-math (market-score): data allow includes lib.
- platform/esi (scoreboard/keys): platform/esi allow is [lib, config].
- composition (demo-board, board-assemble): composition allow includes lib.
- app (admin/esi/esi-view): app allow includes lib.

ui sites stay local because the ui rule allows nothing.

**API sketch.**

```ts
/** Clamp into [min, max]. When max < min, min wins. NaN passes through. */
export function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(value, max)); }
export const clamp01 = (value: number): number => clamp(value, 0, 1);
export const clampPct = (value: number): number => clamp(value, 0, 100);
export function roundTo(value: number, places: number): number { const f = 10 ** places; return Math.round(value * f) / f; }
/** ISK to the cent, as stored in net-worth rows and journal series. */
export const roundIsk = (value: number): number => roundTo(value, 2);
```

**Migration steps.**

1. Create src/lib/math.ts with clamp, clamp01, clampPct, roundTo and roundIsk. Add src/lib/math.test.ts first: an inverted range returns min, plus bounds, NaN passthrough, and roundTo(1.005, 2) matching the current Math.round(v*100)/100 output.
2. Clamp sites:
- Delete the private clamp in editor-leader.ts (38-41), follower-model.ts (86-88) and scoreboard/keys.ts (21-23) and import clamp.
- Replace the ScannerAnchoredPanel closure body at 119 with clamp(value, CARD_EDGE_PX, maxTop).
- Replace the inline clamp in map-controls-model.ts:40 (keep clampStepped), wormhole/motion.ts:21, npc-name-col.ts:22 (clamp(maxName + NAME_BUFFER, MIN_NAME, available)) and fog-painter.ts:82.
3. clamp01: delete market-score.ts:51-53 and replace tween-model.ts:53 and fog-painter.ts:122.
4. clampPct: delete the private copies in job-state.ts:23-25 and progress.ts:18-20, and replace the inline copies in scanner-row-cells.tsx:33 (clampPct(signalPct ?? 0)) and esi-view.ts:23.
5. Rounding: delete roundIsk in plan.ts, valuation.ts and demo-board.ts and import roundIsk. Use roundIsk at board-assemble.ts:485-486. Replace roundTo2 in build-batch.ts with roundTo(x, 2) and leader-path round() with roundTo(value, 2).
6. Run pnpm check through test-runner. Fallow should then report no unused private helpers.

**Tests.** New: src/lib/math.test.ts.

Existing tests that guard behaviour:
- src/mapper/signatures/SignatureEditor.test.ts (editorLeader clamps when the panel cannot reach the row)
- src/mapper/windows/follower-model.test.ts
- src/mapper/signatures/ScannerAnchoredPanel.test.ts
- src/mapper/canvas/map-controls-model.test.ts
- src/features/industry-jobs/job-state.test.ts
- src/features/skill-queue/progress.test.ts
- src/data/industry-math/market-score.test.ts
- src/features/net-worth/valuation.test.ts
- src/features/character-sheet/plan.test.ts
- src/composition/board/board-assemble.test.ts
- src/composition/board/demo-board.test.ts
- src/features/industry-planner/build-batch.test.ts
- src/mapper/fog/fog-painter.test.ts
- src/platform/esi/scoreboard/budget.test.ts

**Notes.** The proposal's drift is not a bug, because no 'hi wins' copy is reachable with max < min. The shared min-wins rule is therefore behaviour-preserving everywhere, and it is the rule editor-leader, tooltip-placement and npc-name-col deliberately rely on.

Write clamp as Math.max(min, Math.min(value, max)) so min wins without a branch. NaN still propagates, exactly as in every current copy.

market-score's ternary clamp01 also returns NaN for NaN, so behaviour is identical.

roundTo(v, 2) computes 10 ** 2 === 100 exactly, so the output is bit-identical to Math.round(v*100)/100.

Do not put roundIsk in lib/format/isk.ts. It feeds persisted values (net_worth_days via valuation and board-assemble), so it is arithmetic, not display formatting.

<sub>Reported by: area:features-owned, area:mapper-signatures, area:mapper-surface, concern:generic-utils.</sub>

<a id="p096"></a>

## P096: Export roundIsk from lib/format/isk and drop the three private copies and the inline pair

- **Status:** [x] done by P105 (6871c6f9) under the P105/P096 conflict resolution
- **Category:** formatting · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -11 / +4, plus tests.
- **Depends on:** [P105](#p105)
- **Existing primitive:** `src/lib/format/isk.ts`

**Problem.** ISK cent precision is decided separately in four modules. net-worth valuation, the character-sheet journal digest and the demo board each define a private roundIsk(value) = Math.round(value * 100) / 100, and the board's net-worth snapshot inlines the same expression for netWorth and liquidIsk. The rule is simple, but a stored or displayed ISK value can only be traced to its rounding by reading each module.

**Sites (5).**

- [`src/features/net-worth/valuation.ts:83-85,145-156`](../../src/features/net-worth/valuation.ts#L83-L85) — private roundIsk on liquid, assets, sellOrders, buyEscrow, implants and the total
- [`src/features/character-sheet/plan.ts:85-87,121-122`](../../src/features/character-sheet/plan.ts#L85-L87) — private roundIsk on journal inflow and outflow
- [`src/composition/board/demo-board.ts:328-330,336,342,856,876-877`](../../src/composition/board/demo-board.ts#L328-L330) — private roundIsk on demo journal amounts, balances and history worth
- [`src/composition/board/board-assemble.ts:472-490`](../../src/composition/board/board-assemble.ts#L472-L490) — netWorthSnapshot inlines Math.round(x * 100) / 100 for netWorth and liquidIsk (485-486)
- [`src/lib/format/isk.ts:1-21`](../../src/lib/format/isk.ts#L1-L21) — the existing ISK module (formatIsk, formatIskShort, formatIskCompact) with isk.test.ts alongside

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/build-batch.ts:56-58,64-68`](../../src/features/industry-planner/build-batch.ts#L56-L58) — roundTo2 rounds qty * runs * ME multiplier before Math.ceil, a float guard on material quantity, not ISK. Keep it local.
- [`src/mapper/windows/leader-path.ts:6-8`](../../src/mapper/windows/leader-path.ts#L6-L8) — rounds SVG leader-line coordinates, not ISK

</details>

**Home.** `src/lib/format/isk.ts`

**Boundary check.** src/lib/format/isk.ts is in the lib zone and imports nothing. Consumers: features/net-worth and features/character-sheet (the features rule allows lib) and composition (board-assemble.ts and demo-board.ts; the composition rule allows lib). No other shared zone fits: features may not import features, and composition-to-features would leave valuation and plan without a common home.

**API sketch.**

```ts
// src/lib/format/isk.ts
/** ISK has cent precision: round to 2 decimals for storage and arithmetic. */
export function roundIsk(value: number): number; // Math.round(value * 100) / 100
```

**Migration steps.**

1. Add roundIsk to src/lib/format/isk.ts with the exact expression Math.round(value * 100) / 100, plus cases in isk.test.ts (positive, negative, already rounded, and a float-noise case such as 0.1 + 0.2 → 0.3).
2. Delete the private roundIsk in features/net-worth/valuation.ts 83-85 and import from @/lib/format/isk.
3. Delete the private roundIsk in features/character-sheet/plan.ts 85-87 and import it.
4. Delete the private roundIsk in composition/board/demo-board.ts 328-330 and import it.
5. Replace the inline expressions in composition/board/board-assemble.ts 485-486 with roundIsk(netWorth) and roundIsk(liquidIsk).
6. Run pnpm check through the test-runner agent.

**Tests.** Add isk.test.ts cases for roundIsk. Existing guards: net-worth/valuation.test.ts (breakdown totals), character-sheet/plan.test.ts (journal inflow and outflow), composition/board/board-assemble.test.ts (netWorthSnapshot) and composition/board/demo-board.test.ts. All should pass unchanged.

**Notes.** Keep the expression verbatim so results stay bit-identical, including float edge cases such as 1.005 → 1. A toFixed- or EPSILON-based variant would change stored values. The 'format' folder holds display formatters; roundIsk is a precision rule, but it belongs with the other ISK helpers, and lib/format/isk.ts already exists with tests, so no new module is needed. Adjacent lead, not part of this change: demo-board.ts demoHistory (859-880) re-implements netWorthSnapshot's per-pilot sum-and-round (board-assemble.ts 472-490) for synthetic days.

<sub>Reported by: area:composition.</sub>

<a id="p101"></a>

## P101: Add groupBy and getOrInsertComputed to src/lib/array.ts and replace the hand-rolled bucket and get-or-create loops

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -120 lines at the sites and +45 in lib and tests (about -75 net).
- **Depends on:** —
- **Existing primitive:** `src/lib/array.ts:dedupe,chunk (home module); native Map.groupBy at src/data/location-tracking/merge-store.ts:14`

**Problem.** Grouping rows into a Map of arrays is hand-written about 17 times across convex, data, features, composition and mapper. Three copies use the copy-on-every-insert spread `set(k, [...(get(k) ?? []), x])`.

About 14 more sites hand-write get-or-create for Set, object or nested-Map values, using `?? new Set()`, `let x = m.get(k); if (!x) {…}`, or `if (q === undefined) set(k,[x]) else push`.

The native Map.groupBy is used once, in src/data/location-tracking/merge-store.ts:14, but it cannot be adopted repo-wide. Convex typechecks against lib ES2023, and client code would raise the browser floor past Next's default targets. There is no shared helper, so convex/accountMerge.groupSelectionsByMap re-implements merge-store's Map.groupBy call verbatim, and composition and convex each keep a private groupByUser/indexClaimsByUser.

**Verifier revision.** The core claim holds. The same group-by idiom (`get(k) ?? []; push; set`) appears at about 17 array-valued sites, plus about 14 get-or-create sites with Set, object or nested-Map values. They span convex, data, features, composition, mapper, components and app. Map.groupBy cannot be the one answer. convex/tsconfig.json lib is ES2023, so it has no Map.groupBy types. The client bundles (CockpitRawLedger, intel-model, presence-model) fall under the Next default browserslist (Safari 16.4 / Chrome 111), but Map.groupBy needs Safari 17.4 / Chrome 117; the client already uses ES2023 toSorted, never ES2024. So a lib helper is the right home.

Revisions:
- Dropped map-access.ts. Its Records are pre-seeded with admin map ids and drop rows for other maps via `?.push`, so the semantics differ.
- Dropped corp-access.ts, which is already a frozen-Record `??=` one-liner.
- Dropped owner-sync/engine.ts, because that zone may import only platform/esi.
- Dropped the async memo in convex/mapAuthoringSweep, and the fold/merge sites, which are reduces rather than grouping.
- Added missed get-or-create sites: wh-statics diff/cross-check, signature-model, market-prices/source, admin signals, convex recordRemovedStub, asset-map, layout facts and reconciler.
- The 'quadratic spread' sites are not a real efficiency problem at realistic sizes: structure-search results are bounded, there are few affiliations per user, and there are at most 4 resistance modifiers per layer. Fix them for consistency only.
- Named the second helper getOrInsertComputed, after the TC39 upsert proposal, so it can later be swapped for the native method.

**Sites (30).**

- [`convex/accountMerge.ts:187-197`](../../convex/accountMerge.ts#L187-L197) — groupSelectionsByMap: pure group-by; twin of merge-store.ts:14
- [`convex/mapAccessProjection.ts:100-110`](../../convex/mapAccessProjection.ts#L100-L110) — indexClaimsByUser: pure group-by
- [`convex/mapTrackingLive.ts:123-129`](../../convex/mapTrackingLive.ts#L123-L129) — trackedByCharacter: filter by requested set, then group
- [`src/composition/map-access-projection.ts:105-115`](../../src/composition/map-access-projection.ts#L105-L115) — groupByUser: pure group-by (private copy of the convex one)
- [`src/data/maps/queries.ts:266-271`](../../src/data/maps/queries.ts#L266-L271) — materializeAuthorizedMaps groups raw rows by map id
- [`src/features/wormhole-sites/queries.ts:243-248, 250-256, 258-268, 372-377`](../../src/features/wormhole-sites/queries.ts#L243-L248) — npcs by wave (twice, once per function), waves by site with aggregateWave reshaping, resources by site with hydration reshaping
- [`src/data/market-history/queries.ts:28-40`](../../src/data/market-history/queries.ts#L28-L40) — group by typeId with row reshape; within-group order relies on ORDER BY date
- [`src/data/eve-data/queries.ts:459-470`](../../src/data/eve-data/queries.ts#L459-L470) — getProductionModifiers: type-guard filter plus reshape, grouped by sourceTypeId
- [`src/data/eve-data/wormhole-effects.ts:151-157`](../../src/data/eve-data/wormhole-effects.ts#L151-L157) — foldResistances: key derived by regex with skip; copy-on-insert spread
- [`src/composition/structure-search.ts:128-131`](../../src/composition/structure-search.ts#L128-L131) — nested loop, copy-on-insert spread; seenBy insertion order decides which MAX_STRUCTURE_RESULTS are read
- [`src/composition/map-character-scoping.ts:54-58`](../../src/composition/map-character-scoping.ts#L54-L58) — eligibleByUser: copy-on-insert spread group-by
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:17-27`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L17-L27) — groupByCategory (client); key insertion order feeds the 'other labels' ordering
- [`src/mapper/windows/intel-model.ts:14-23`](../../src/mapper/windows/intel-model.ts#L14-L23) — filtered bucket loop (client)
- [`src/mapper/tracking/presence-model.ts:55-60`](../../src/mapper/tracking/presence-model.ts#L55-L60) — pilots by system (client), sorted afterwards
- [`src/features/changelog/parse.ts:135-139, 163-184`](../../src/features/changelog/parse.ts#L135-L139) — closure append into summaries; parseChangelogMasters keeps byVersion plus a parallel masters array that equals [...byVersion.values()]
- [`src/data/eve-data/universe-assets.ts:121-131`](../../src/data/eve-data/universe-assets.ts#L121-L131) — Set-valued get-or-create (adjacency)
- [`src/data/wh-statics/diff.ts:8-17`](../../src/data/wh-statics/diff.ts#L8-L17) — codesBySystem: Set-valued get-or-create
- [`src/data/wh-statics/cross-check.ts:23-31`](../../src/data/wh-statics/cross-check.ts#L23-L31) — addToSystemSet: Set-valued get-or-create
- [`src/mapper/signatures/signature-model.ts:209-216`](../../src/mapper/signatures/signature-model.ts#L209-L216) — presentBySystem: Set-valued get-or-create (filtered)
- [`src/data/industry-indices/queries.ts:20-28`](../../src/data/industry-indices/queries.ts#L20-L28) — nested Map get-or-create
- [`src/features/industry-planner/build-consolidate.ts:32-46`](../../src/features/industry-planner/build-consolidate.ts#L32-L46) — Set and nested-Map get-or-create blocks
- [`src/components/use-live-dataset.ts:26-33`](../../src/components/use-live-dataset.ts#L26-L33) — memoryFor module-level get-or-create
- [`src/data/maps/chain-collapse.ts:52-61`](../../src/data/maps/chain-collapse.ts#L52-L61) — bidirectional adjacency append helper
- [`src/data/eve-data/character-facts.ts:163-168`](../../src/data/eve-data/character-facts.ts#L163-L168) — object accumulator { groupId, name, skills[] }
- [`src/data/market-prices/source.ts:101-105`](../../src/data/market-prices/source.ts#L101-L105) — order bucket object get-or-create
- [`src/app/(site)/admin/signals.ts:442-448`](../../src/app/%28site%29/admin/signals.ts#L442-L448) — { page, labels: Set } get-or-create
- [`convex/mapAuthoringSweep.ts:76-85`](../../convex/mapAuthoringSweep.ts#L76-L85) — recordRemovedStub object accumulator
- [`src/features/owned-assets/asset-map.ts:65-69`](../../src/features/owned-assets/asset-map.ts#L65-L69) — summary get-or-create, then mutate
- [`src/mapper/layout/facts.ts:42-44`](../../src/mapper/layout/facts.ts#L42-L44) — if undefined set([child]) else push
- [`src/mapper/chain/reconciler.ts:225-227`](../../src/mapper/chain/reconciler.ts#L225-L227) — if undefined set([id]) else push

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/location-tracking/merge-store.ts:14`](../../src/data/location-tracking/merge-store.ts#L14) — Already native Map.groupBy in server-only code under the esnext tsconfig. Leave it, or switch it to the lib helper for uniformity; either way is correct.
- [`src/platform/owner-sync/engine.ts:74-80`](../../src/platform/owner-sync/engine.ts#L74-L80) — Rule {from: platform/owner-sync, allow: [platform/esi]} forbids lib. Leave it, or use native Map.groupBy on a pre-filtered list; it is server-only and Node is v22.
- [`src/composition/map-access.ts:33-45, 70-80`](../../src/composition/map-access.ts#L33-L45) — Not a group-by. These are Records pre-seeded with adminMapIds, and `?.push` silently drops rows for other maps; the Record shape is the MapChromeData contract. The inline grants loop at 70-80 could become a local sibling of groupBlocksByMap, but that is local only.
- [`src/platform/auth/corp-access.ts:28-35`](../../src/platform/auth/corp-access.ts#L28-L35) — A frozen Record contract built with a `(members[id] ??= []).push` one-liner. Already minimal.
- [`convex/mapAuthoringSweep.ts:47-51`](../../convex/mapAuthoringSweep.ts#L47-L51) — An async memo (the create step awaits a read), which a sync getOrInsertComputed cannot express.
- [`src/features/owned-assets/esi-projection.ts:18-28`](../../src/features/owned-assets/esi-projection.ts#L18-L28) — A fold that sums quantities, not grouping.
- [`src/features/owned-blueprints/blueprint-map.ts:87-99`](../../src/features/owned-blueprints/blueprint-map.ts#L87-L99) — A best-copy reduce, not grouping.
- [`src/mapper/chain/stub-layout.ts:236-248`](../../src/mapper/chain/stub-layout.ts#L236-L248) — collapseSeats keeps the preferred candidate (a reduce).

</details>

**Home.** `src/lib/array.ts (beside dedupe and chunk), with tests in src/lib/array.test.ts`

**Boundary check.** Home zone lib (src/lib/**). The rule {from: lib, allow: [config]} is satisfied because the helpers import nothing. Each consumer zone is allowed to import lib:
- convex: {from: convex, allow: [platform/esi, platform/auth, data, lib]}. Convex already imports @/lib/sync-engine and @/lib/env.
- composition: allow includes lib.
- data: allow includes lib.
- features: allow includes lib.
- mapper: allow includes lib.
- components (src/components/use-live-dataset.ts): allow includes lib.
- app (src/app/(site)/admin/signals.ts): allow includes lib.

Excluded for boundary reasons: platform/owner-sync, whose rule allows only platform/esi.

**API sketch.**

```ts
export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]>;
export function groupBy<T, K, V>(items: Iterable<T>, keyOf: (item: T) => K, valueOf: (item: T) => V): Map<K, V[]>;
/** Mirrors the TC39 upsert proposal's Map.prototype.getOrInsertComputed. */
export function getOrInsertComputed<K, V>(map: Map<K, V>, key: K, compute: (key: K) => V): V; // uses map.has(key), so a stored falsy or undefined value is not recomputed
```

**Migration steps.**

1. Add groupBy (both overloads) and getOrInsertComputed to src/lib/array.ts, with tests.
2. Pure group-by sites: delete convex/accountMerge.ts groupSelectionsByMap (187-197), convex/mapAccessProjection.ts indexClaimsByUser (100-110) and src/composition/map-access-projection.ts groupByUser (105-115), calling groupBy at their call sites. Replace the loops in src/data/maps/queries.ts 266-271, CockpitRawLedger.tsx 21-27 and wormhole-sites/queries.ts 243-248 and 372-377.
3. Reshape sites, using valueOf:
- market-history/queries.ts 28-40: key r.typeId; the value is the six-field row.
- eve-data/queries.ts 459-470: groupBy(rows.filter(isProductionModifier), r => r.sourceTypeId, toModifier).
- wormhole-sites/queries.ts 250-256 and 258-268: waves through aggregateWave; resources through the liveIsk/effectiveIsk/liveEligible hydration.
- presence-model.ts 55-60: groupBy(byCharacter.values(), e => e.systemId, e => e.pilot).
4. Filter-then-group sites:
- mapTrackingLive.ts 123-129: groupBy over rows filtered by `requested`.
- intel-model.ts 14-23 and wormhole-effects.ts 151-157: the key is computed with a skip inside the loop, so use getOrInsertComputed(map, key, () => []).push(x) rather than computing the key twice.
5. Copy-on-insert spread sites: map-character-scoping.ts 54-58 becomes groupBy(affiliations, r => r.userId). structure-search.ts 128-131 becomes a nested loop with getOrInsertComputed(seenBy, id, () => []).push(accessToken).
6. Get-or-create sites: switch each to getOrInsertComputed. Sites: universe-assets.ts 121-131, wh-statics/diff.ts 8-17, wh-statics/cross-check.ts 23-31, signature-model.ts 209-216, industry-indices/queries.ts 20-28, build-consolidate.ts 32-46, use-live-dataset.ts 26-33, chain-collapse.ts 52-61 (the append helper becomes a one-liner), character-facts.ts 163-168, market-prices/source.ts 101-105, admin/signals.ts 442-448, convex/mapAuthoringSweep.ts 76-85, asset-map.ts 65-69, layout/facts.ts 42-44 and reconciler.ts 225-227.
7. Rewrite changelog/parse.ts:
- 135-139: getOrInsertComputed(summaries, master, () => []).push(paragraph).
- 163-184: groupBy(parseChangelog(md), e => masterVersionOf(e.version)), then map each [version, subVersions] to a ChangelogMaster. Delete the parallel masters array.
8. Leave merge-store.ts:14, platform/owner-sync/engine.ts, map-access.ts and corp-access.ts as they are.

**Tests.** New cases in src/lib/array.test.ts:
- groupBy keeps first-seen key order and in-group input order.
- groupBy with valueOf.
- groupBy on an empty iterable and on a generator input.
- getOrInsertComputed calls compute only on a miss, passes the key, and returns the stored value even when it is falsy (0, '').

Existing tests that guard the migrated sites:
- convex/accountMerge.test.ts, convex/mapAccessProjection.test.ts, convex/mapTracking.test.ts, convex/mapTrackingScoped.test.ts
- src/composition/map-access-projection.test.ts, map-character-scoping.test.ts, structure-search.test.ts
- src/data/maps/queries.test.ts and its .db test, chain-collapse.test.ts
- src/features/wormhole-sites/queries.test.ts
- src/data/market-history/queries.db.test.ts, src/data/eve-data/queries.db.test.ts, character-facts.db.test.ts, wormhole-effects.test.ts, universe-assets.test.ts
- src/data/industry-indices/queries.test.ts, src/data/wh-statics/diff.test.ts, cross-check.test.ts
- src/features/changelog/parse.test.ts, build-consolidate.test.ts
- src/mapper/windows/intel-model.test.ts, presence-model.test.ts, signature-model.test.ts

**Notes.** Order that must be preserved:
- Map key insertion order is load-bearing. structure-search reads only the first MAX_STRUCTURE_RESULTS entries of seenBy in insertion order. CockpitRawLedger appends unknown category labels in first-seen order. Changelog masters come out in first-seen version order.
- In-group order is load-bearing for market-history (ORDER BY date asc) and wormhole waves (ORDER BY waveNumber).
- groupBy must iterate the input once, in order, and push. getOrInsertComputed must test with has(), not `??`.

The quadratic spreads (structure-search, map-character-scoping, wormhole-effects) are correct, and n is small at all three. They are a style drift, not a performance bug.

Related lead in the same file: wormhole-sites/queries.ts listSiteDetails (179-287) and getSiteDetail (323-385) duplicate the whole wave and resource hydration. Both run loadNpcsForWaves, collect distinct typeIds, call getCombatStatsBatch, bucket npcs by wave, call aggregateWave, and apply the resource liveIsk:null / effectiveIsk / liveEligible defaults. A local hydrateWaves/hydrateResource helper, or having getSiteDetail reuse the batch path, would remove one of the npc bucket loops outright. Consider doing this in the same PR.

<sub>Reported by: area:composition, area:data-eve, area:features-sites-misc, area:industry-planner, area:platform, concern:generic-utils, dupes-triage-1, dupes-triage-2.</sub>

<a id="p102"></a>

## P102: Promote eligibleIdsKey to sortedUniqueIds / idsKey / parseIdsKey in src/lib/array.ts and delete the local copies

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 / +15 (another -25 if the optional live-flag removal is done).
- **Depends on:** —
- **Existing primitive:** `src/lib/live-dataset.ts:eligibleIdsKey; src/lib/use-stable-value.ts:useStableValue`

**Problem.** src/lib/live-dataset.ts exports eligibleIdsKey (`[...new Set(ids)].sort((a,b)=>a-b).join(',')`), and it has one consumer. Every other site rebuilds the key or its parse by hand:
- features/wormhole-sites keeps a token-identical copy, scannerLiveTypeIdKey.
- data/convex/use-sync-subject and use-component-fee-sources inline the key.
- live-dataset, use-sync-subject, use-names, use-component-fee-sources and use-chain-node-sync each parse it back with `split(',').map(Number)`. Each guards the empty key differently: a ternary, an early return, `enabled: key !== ''`, or a length check. Each guard is correct today, but the [0]-for-'' trap is re-solved at every new call site.
- The sorted-unique array without the join is hand-written in composition/board-assemble (a private sorted()), data/eve-data/names-client, mapper/tracking/presence-model and convex/mapTrackingLive.

**Verifier revision.** The sorted-unique, key and parse concept is real:
- eligibleIdsKey in lib and scannerLiveTypeIdKey in features have identical bodies.
- use-sync-subject and use-component-fee-sources inline the same key.
- Five sites split the key back with their own differently shaped guards against `''.split(',').map(Number)` returning [0].
- Sorted-unique without the join is repeated in board-assemble, names-client, presence-model and convex/mapTrackingLive.

Rejected parts:
- The useStableIds hook. useStableValue already exists.
- The mapper authoredKey (use-map-chain-pages.ts:94 and use-map-chain-halo.ts:29-43). It is an order-preserving key whose index feeds deriveHalo's `order`, so it is not a sorted id set. Its per-render join over a chain of tens to hundreds of systems is not a real cost.
- chainSignature. It is a composite layout identity over systems, connections and completeness flags, not an id key.

The OutboundArrow `live` flag really is always true, but removing it is a separate simplification, kept as an optional last step.

**Sites (15).**

- [`src/lib/live-dataset.ts:1-11`](../../src/lib/live-dataset.ts#L1-L11) — eligibleIdsKey plus the ternary-guarded parse in anyEligibleCold
- [`src/features/industry-jobs/use-jobs-live.ts:16`](../../src/features/industry-jobs/use-jobs-live.ts#L16) — the only eligibleIdsKey consumer
- [`src/features/wormhole-sites/scanner-live-isk.ts:29-31`](../../src/features/wormhole-sites/scanner-live-isk.ts#L29-L31) — scannerLiveTypeIdKey: identical body
- [`src/features/wormhole-sites/components/ScannerLivePrices.tsx:54-57`](../../src/features/wormhole-sites/components/ScannerLivePrices.tsx#L54-L57) — the only scannerLiveTypeIdKey consumer (refreshKey)
- [`src/data/convex/use-sync-subject.ts:16-20`](../../src/data/convex/use-sync-subject.ts#L16-L20) — inline sorted-unique key, early return on '', then split/map(Number)
- [`src/features/industry-planner/components/use-component-fee-sources.ts:54-62, 79, 94`](../../src/features/industry-planner/components/use-component-fee-sources.ts#L54-L62) — Set, then sort, then join key; parsed at 79; guarded only by enabled: key !== '' at 94
- [`src/data/eve-data/use-names.ts:7-12`](../../src/data/eve-data/use-names.ts#L7-L12) — normalize().join, then the '' early return and split/map(Number)
- [`src/data/eve-data/names-client.ts:10-15`](../../src/data/eve-data/names-client.ts#L10-L15) — normalize = sorted-unique, then a cache filter or maxIds cap
- [`src/composition/board/board-assemble.ts:122-124, 178-182`](../../src/composition/board/board-assemble.ts#L122-L124) — private sorted() = sorted-unique, used five times
- [`src/mapper/tracking/presence-model.ts:88-98`](../../src/mapper/tracking/presence-model.ts#L88-L98) — coverageQueryArgs: inline sorted-unique
- [`convex/mapTrackingLive.ts:121`](../../convex/mapTrackingLive.ts#L121) — inline sorted-unique
- [`src/mapper/chain/use-chain-node-sync.ts:108-117`](../../src/mapper/chain/use-chain-node-sync.ts#L108-L117) — order-preserving join with a length-guarded parse; only the parse half applies
- [`src/mapper/tracking/OutboundArrowProvider.tsx:31-51`](../../src/mapper/tracking/OutboundArrowProvider.tsx#L31-L51) — key and parse round trip of {systemId, live} where live is always true
- [`src/mapper/tracking/pilot-path.ts:86-96, 129-136, 141-153`](../../src/mapper/tracking/pilot-path.ts#L86-L96) — offMapPilotLiveness ORs an always-true flag; arrowPilotKey/parseArrowPilotKey
- [`src/mapper/canvas/ChainLinkEdge.tsx:78-99, 152`](../../src/mapper/canvas/ChainLinkEdge.tsx#L78-L99) — the `live ? 'text-isk' : 'text-muted'` branch is unreachable in production

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/chain/use-map-chain-pages.ts:94`](../../src/mapper/chain/use-map-chain-pages.ts#L94) — authoredKey is order-preserving (not sorted) and its index becomes deriveHalo's `order`. The string memo key is cheap; useStableValue already exists if a reference-stable array is ever wanted.
- [`src/mapper/chain/use-map-chain-halo.ts:29-43`](../../src/mapper/chain/use-map-chain-halo.ts#L29-L43) — Parses authoredKey with order. Different semantics from a sorted id set.
- [`src/mapper/chain/chain-signature.ts:17-32`](../../src/mapper/chain/chain-signature.ts#L17-L32) — A composite layout identity (systems, connections, completeness flags, tombstones), not an id key.
- [`src/data/maps/semantic-write.ts:45`](../../src/data/maps/semantic-write.ts#L45) — A string-sorted signature-id key with a systemId prefix; a different domain.

</details>

**Home.** `src/lib/array.ts. live-dataset.ts keeps its reconcile helpers and uses parseIdsKey.`

**Boundary check.** Home zone lib, which imports nothing. Each consumer zone is allowed to import lib:
- features (use-jobs-live, ScannerLivePrices, use-component-fee-sources): features allow includes lib.
- data (data/convex/use-sync-subject, data/eve-data use-names and names-client): {from: data, allow: [..., lib, config]}.
- mapper (presence-model, use-chain-node-sync, OutboundArrowProvider): mapper allow includes lib.
- composition (board-assemble): composition allow includes lib.
- convex (mapTrackingLive): {from: convex, allow: [platform/esi, platform/auth, data, lib]}.

**API sketch.**

```ts
export function sortedUniqueIds(ids: Iterable<number>): number[]; // [...new Set(ids)].sort((a, b) => a - b)
export function idsKey(ids: Iterable<number>): string;            // sortedUniqueIds(ids).join(',')
export function parseIdsKey(key: string): number[];                // key === '' ? [] : key.split(',').map(Number)
```

**Migration steps.**

1. Add sortedUniqueIds, idsKey and parseIdsKey to src/lib/array.ts. Move the cases from live-dataset.test.ts:5-6 and scanner-live-isk.test.ts:60-61 into array.test.ts, and add parseIdsKey('') -> [] and a round-trip case.
2. In src/lib/live-dataset.ts, delete eligibleIdsKey and make anyEligibleCold use `new Set(parseIdsKey(eligibleKey))`. Switch use-jobs-live.ts:16 to idsKey. Fallow would flag a leftover alias, so do not keep one.
3. Delete scannerLiveTypeIdKey (scanner-live-isk.ts:29-31) and make ScannerLivePrices.tsx:56 use idsKey(typeIds).
4. In use-sync-subject.ts:16,20, use idsKey and parseIdsKey and keep the `=== ''` early return. In use-component-fee-sources.ts:61, return idsKey(ids); at 79, use parseIdsKey(key); keep the enabled guard at 94.
5. In names-client.ts:11, use sortedUniqueIds(ids) and keep the filter and cap policy. In use-names.ts:12, use parseIdsKey(idsKey) and keep the join of normalize(), because normalize applies the policy.
6. Delete board-assemble.ts sorted() (122-124) and use sortedUniqueIds at 178-182. Use it in presence-model.ts coverageQueryArgs (95-96) and convex/mapTrackingLive.ts:121.
7. In use-chain-node-sync.ts:112-116, replace the length-guarded split with parseIdsKey(nodeIdsKey). Keep the order-preserving join.
8. Optional and separate (confirm with the owner first that muted arrows for stale presence are not planned): drop `live` from ArrowPilotSystem and OutboundArrow. OutboundArrowProvider then becomes pilotKey = idsKey(presence?.keys() ?? []) and pilotSystems = parseIdsKey(pilotKey). Delete arrowPilotKey/parseArrowPilotKey. offMapPilotLiveness becomes a Set filter. ChainLinkEdge always uses text-isk.

**Tests.** New cases in src/lib/array.test.ts: sortedUniqueIds dedupes and sorts numerically, not lexically ([10, 9, 10] -> [9, 10]); idsKey([]) === ''; parseIdsKey('') returns [] (the [0] trap); idsKey/parseIdsKey round trip.

Existing tests that guard the migrated sites: src/lib/live-dataset.test.ts:12-15 (anyEligibleCold, including the '' key), use-component-fee-sources.test.ts, names-client.test.ts, board-assemble.test.ts, presence-model.test.ts, convex/mapTracking.test.ts (coverage).

If the optional step is taken, update pilot-path.test.ts:126-127 and SystemNode.test.ts (around line 355).

**Notes.** Keys must stay byte-identical. idsKey output equals eligibleIdsKey and scannerLiveTypeIdKey for the same input, so refreshKey and coldKey identities do not change.

Not every site sorts:
- use-chain-node-sync and authoredKey preserve order and must stay unsorted.
- names-client's normalize also filters non-positive ids (cache policy) or caps at maxIds (no-cache policy). Only its sort-unique step moves.

No current parse site is buggy; every one guards ''. The value is removing a trap that each new caller would otherwise have to solve.

This edits src/lib/array.ts alongside P101 and P103. There is no ordering dependency, but land them as separate commits to avoid conflicts.

<sub>Reported by: area:features-sites-misc, area:mapper-chain, concern:client-hooks, concern:generic-utils.</sub>

<a id="p112"></a>

## P112: Add sameItems and sameFields shallow-equality helpers to src/lib

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -50 at the sites, about +20 helpers, about +30 tests
- **Depends on:** —
- **Existing primitive:** `src/lib/array.ts:dedupe,chunk (home module)`

**Problem.** Ordered array equality (`a.length === b.length && a.every((x, i) => x === b[i])`) is written by hand in MapWindowLayer (twice, identical), convex mapAccessProjection (rolesEqual, and charactersEqual with a custom element comparator), map-controls-model.directionPresetOf, signature-model.sameGlanceMarkIndex, and fog-model.sameFogReveals. The flat-record comparisons fog-model sameDisc/sameStroke, follower-model sameSharedFollowerFrame and the 7-term baseline check in computeFollowerTransform each list every field by hand. Together they cover all 14 FollowerBaseline fields, so adding a field without updating the list silently skips writes or keeps stale fog reveals.

**Verifier revision.** The core is real. Element-wise array equality is hand-written six times across mapper and convex. MapWindowLayer has two identical functions 4 lines apart. Several flat-record comparisons list every field by hand, so they silently go stale when a field is added. fog-model is a high-churn hotspot (20 commits, churn 7879), and every field of FogDisc, FogStroke and FollowerBaseline is listed by hand. What changes: (1) Additional sites: convex charactersEqual (91-97) and the array half of sameFogReveals (121-126). (2) The default comparator must be `===`, not Object.is, so current results are preserved exactly. Object.is would treat -0 and +0 viewport and coordinate values as different and NaN as equal. (3) sameFields must be typed `T extends object`, because FogDisc, FogStroke and FollowerBaseline are interfaces and do not satisfy Record<string, unknown>. It must also check key count and key presence. (4) sameCodeMeaning, sameIds and the set comparisons are excluded because they have different semantics.

**Sites (9).**

- [`src/mapper/windows/MapWindowLayer.tsx:34-40, 42-50, 72`](../../src/mapper/windows/MapWindowLayer.tsx#L34-L40) — sameStack and sameSelectedIds are identical; one is a useStore equalityFn, the other a render-time stack check
- [`convex/mapAccessProjection.ts:60-65`](../../convex/mapAccessProjection.ts#L60-L65) — rolesEqual(StoredMapRole[], MapRole[]); MapRole is a subtype, so T infers StoredMapRole; callers at 132 and 330
- [`convex/mapAccessProjection.ts:91-97`](../../convex/mapAccessProjection.ts#L91-L97) — charactersEqual: undefined guard, then element-wise compare on characterId and name (added site)
- [`src/mapper/canvas/map-controls-model.ts:172-187`](../../src/mapper/canvas/map-controls-model.ts#L172-L187) — directionPresetOf inlines length plus every-index equality
- [`src/mapper/signatures/signature-model.ts:227-238`](../../src/mapper/signatures/signature-model.ts#L227-L238) — sameGlanceMarkIndex inner bucket-array compare at 233-235
- [`src/mapper/fog/fog-model.ts:103-119`](../../src/mapper/fog/fog-model.ts#L103-L119) — sameDisc and sameStroke list every field of FogDisc (31-37) and FogStroke (39-47)
- [`src/mapper/fog/fog-model.ts:121-126`](../../src/mapper/fog/fog-model.ts#L121-L126) — sameFogReveals: element-wise compare of discs and strokes with a custom comparator (added site); used by FogLayer through useStableValue
- [`src/mapper/windows/follower-model.ts:90-113`](../../src/mapper/windows/follower-model.ts#L90-L113) — SharedFollowerFrame interface and sameSharedFollowerFrame, used only at 355
- [`src/mapper/windows/follower-model.ts:282-297, 330-358`](../../src/mapper/windows/follower-model.ts#L282-L297) — FollowerBaseline has 14 fields; the 346-356 check plus sameSharedFollowerFrame compares all 14 by hand

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapJumpAuthoring.ts:115-122`](../../convex/mapJumpAuthoring.ts#L115-L122) — sameIds is order-insensitive set equality, not ordered sameItems
- [`src/data/maps/signature-eliminator.ts:59-72`](../../src/data/maps/signature-eliminator.ts#L59-L72) — sameCodeMeaning deliberately compares a subset of fields with farSide branching
- [`src/mapper/chain/intents.ts:33-35`](../../src/mapper/chain/intents.ts#L33-L35) — samePosition compares two fields; clear as is
- [`convex/mapAuthoringFields.ts:122-131`](../../convex/mapAuthoringFields.ts#L122-L131) — sameDeathWindow compares a derived stored value with null handling; two fields
- [`src/data/wh-statics/cross-check.ts:37`](../../src/data/wh-statics/cross-check.ts#L37) — equalSets is set equality and belongs to the separate wh-statics code-set opportunity
- [`src/data/wh-statics/diff.ts:24`](../../src/data/wh-statics/diff.ts#L24) — sameCodes is set equality, same as above
- [`src/platform/purge/__tests__/coverage.ts:173`](../../src/platform/purge/__tests__/coverage.ts#L173) — test helper, order-insensitive

</details>

**Home.** `sameItems goes in src/lib/array.ts, the existing array-helper home with array.test.ts. sameFields goes in a new src/lib/equality.ts.`

**Boundary check.** Home zone is lib (src/lib/**). The lib rule allows only config, and these helpers import nothing. Consumers: mapper (MapWindowLayer, map-controls-model, signature-model, fog-model, follower-model), whose rule allows lib, and convex (mapAccessProjection.ts), whose rule allows platform/esi, platform/auth, data and lib. Convex already imports '@/lib/sync-engine', '@/lib/env' and '@/lib/fetch-with-timeout', so the alias works there.

**API sketch.**

```ts
// src/lib/array.ts
export function sameItems<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): boolean; // length check, then eq per index
// src/lib/equality.ts
export function sameFields<T extends object>(a: T, b: T): boolean; // same own-key count, every key of a present in b with a[k] === b[k]
```

**Migration steps.**

1. Add sameItems to src/lib/array.ts and extend src/lib/array.test.ts.
2. Create src/lib/equality.ts with sameFields and src/lib/equality.test.ts. Use `===`, not Object.is. Cast internally to Record<PropertyKey, unknown> so interfaces type-check.
3. MapWindowLayer.tsx: delete sameStack and sameSelectedIds (34-40). Pass sameItems as the useStore equalityFn at 48 and use it for the stack check at 72.
4. map-controls-model.ts: change the directionPresetOf condition to `sameItems(sequence, config.directionSequence)`.
5. signature-model.ts sameGlanceMarkIndex: change the inner check to `if (other === undefined || !sameItems(buckets, other)) return false;`.
6. convex/mapAccessProjection.ts: delete rolesEqual and use sameItems at 132 and 330. In charactersEqual, keep the undefined guard, then `return sameItems(left, right, (a, b) => a.characterId === b.characterId && a.name === b.name)`.
7. fog-model.ts: delete sameDisc and sameStroke. sameFogReveals becomes `sameItems(left.discs, right.discs, sameFields) && sameItems(left.strokes, right.strokes, sameFields)`.
8. follower-model.ts: delete SharedFollowerFrame and sameSharedFollowerFrame (90-113). Replace 346-356 with `if (baseline !== null && sameFields(baseline, next)) return null;`.

**Tests.** New tests: sameItems (equal, different length, different order, custom eq, readonly inputs) in src/lib/array.test.ts; sameFields (equal, one field differs, extra key, missing key with an undefined value, -0 vs +0 equal under ===) in src/lib/equality.test.ts. Existing guards: fog-model.test.ts 342-355 ('sameFogReveals ignores node identity churn but sees moves and phases'); follower-model.test.ts around 160-180 (unchanged baseline returns null) and 182+ (writes on viewport, anchor and retarget changes); convex/mapAccessProjection.test.ts counts at 102-189 (unchanged and updated); signature-model.test.ts sameGlanceMarkIndex cases; map-controls-model.test.ts 54 (directionPresetOf round-trip).

**Notes.** Keep `===` as the default comparator. Object.is would change results for -0/+0, which viewport tx/ty and layout coordinates can produce, and for NaN. charactersEqual reads `right[index]?.` today; the length check in sameItems makes that optional chaining unnecessary, with the same result. sameFields relies on both records having the same literal shape: FollowerBaseline is built from one literal at 330-345, and FogDisc and FogStroke come from deriveFogReveals. A future optional field would differ between {k: undefined} and an absent key under the key-count check; that is acceptable and arguably more correct. sameFields allocates Object.keys per comparison: fog compares about nodes plus edges per FogLayer render, and the follower about once per coalesced frame per open window, which is negligible.

<sub>Reported by: area:mapper-surface.</sub>

<a id="p100"></a>

## P100: Add mapConcurrent to src/lib/fan-out.ts and replace six hand-rolled worker pools

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -75 production lines across five modules; about +20 in fan-out.ts; about +50 test lines
- **Depends on:** —
- **Existing primitive:** `src/lib/fan-out.ts:mapByIdDroppingNulls (the unbounded sibling; fan-out.ts and fan-out.test.ts are the home)`

**Problem.** Five modules contain six hand-written bounded-concurrency pools (runConcurrent twice, mapBounded, an inline pool in entity-names, and two inline deadline pools in composition). They differ in empty-input guards, result ordering, runner count and cancellation:
- Only market-prices stops claiming new items after a rejection.
- In character-authorization and strict entity-name resolution, a rejected item fails the caller while sibling runners keep calling ESI and refreshing tokens in the background.
src/lib/fan-out.ts, which already holds the unbounded mapByIdDroppingNulls and its tests, has no bounded variant.

**Verifier revision.** Six hand-rolled cursor pools are confirmed: spawn min(limit, n) runners, each claims items[cursor++]. Fallow flags the market-history and market-prices copies as near-duplicates (dupes-grouped.txt:1780-1781). The scope and design change in five ways.
- The drift claims mostly do not cause bugs. The market-history, refresh-on-view and map-affiliation workers catch every error, so a missing cancel path never fires there.
- The 'three nested pools' efficiency claim is wrong. fetchLivePrice passes one typeId to fetchPricesFromSource, so the inner runConcurrent spawns a single runner.
- Two sites do keep claiming work after their caller has already failed:
  - character-authorization: claimAuthorization at line 42 sits outside the try. If it rejects, Promise.all rejects, the trailing publishAccessChanges is skipped, and the other three runners keep force-refreshing tokens in the background until the 35 s deadline.
  - resolveEntityNamesStrict: the typeahead fails while sibling runners keep fetching.
  Fail-fast (stop claiming after the first rejection, as market-prices does) is the right single behaviour.
- The proposed stopOnError and shouldStop options are not needed:
  - Every 'do not abort' worker already catches internally.
  - Deadline and budget checks belong at the top of the worker. market-prices must still record budget-skipped ids into fallbackNeeded, so its check cannot leave the worker. The deadline sites only skip, which is equivalent because the claim is synchronous.
- Payoff is medium, not high: this removes about 75 lines of concurrency code across five modules and adds one tested primitive. It does not fix a production-visible defect.

**Sites (10).**

- [`src/data/market-prices/source.ts:65-91`](../../src/data/market-prices/source.ts#L65-L91) — runConcurrent: empty guard, a cancelled flag set on first rejection, rethrow. This is the reference semantics.
- [`src/data/market-prices/source.ts:192-197`](../../src/data/market-prices/source.ts#L192-L197) — region-dump pages (PAGE_CONCURRENCY 8); the worker throws EsiServerError or EsiContractError, so fail-fast matters here
- [`src/data/market-prices/source.ts:210-233`](../../src/data/market-prices/source.ts#L210-L233) — per-type fetch (PER_TYPE_CONCURRENCY 10); the worker swallows errors and records budget-skipped ids into fallbackNeeded
- [`src/data/market-history/source.ts:50-66, 76-91`](../../src/data/market-history/source.ts#L50-L66) — runConcurrent copy with no cancellation. Its worker catches every error, so the missing cancel is harmless; the budgetExhausted early return stays in the worker.
- [`src/data/market-prices/refresh-on-view.ts:73-89, 113-128`](../../src/data/market-prices/refresh-on-view.ts#L73-L89) — mapBounded with order-preserving results; the worker catches every error. fetchLivePrice (60-71) passes a single typeId, so there is no nested fan-out.
- [`src/data/eve-data/entity-names.ts:25-44`](../../src/data/eve-data/entity-names.ts#L25-L44) — resolveEntityNamesBounded inline pool (RESOLVE_CONCURRENCY 8) writing into a record
- [`src/data/eve-data/entity-names.ts:56-62`](../../src/data/eve-data/entity-names.ts#L56-L62) — the strict variant rejects, but sibling runners keep fetching (caller: composition/map-character-search.ts:43, ids capped at MAX_TYPEAHEAD_RESULTS)
- [`src/composition/map-affiliation-access.ts:33-60`](../../src/composition/map-affiliation-access.ts#L33-L60) — inline pool with a fixed DELIVERY_CONCURRENCY of 4 runners. Before each claim it checks the deadline minus FINALIZE_RESERVE_MS and passes the remaining time as timeoutMs; the worker catches everything.
- [`src/composition/character-authorization.ts:34-52`](../../src/composition/character-authorization.ts#L34-L52) — inline pool with a literal 4 runners and a Date.now() < deadline guard. claimAuthorization (42) is outside the try, so its rejection leaves siblings running after the function throws.
- [`src/lib/fan-out.ts:1-11`](../../src/lib/fan-out.ts#L1-L11) — home module; only the unbounded mapByIdDroppingNulls exists (consumers: character-sheet, industry-jobs, skill-queue, composition/board)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/fan-out.ts:1-11`](../../src/lib/fan-out.ts#L1-L11) — mapByIdDroppingNulls stays unbounded. Its callers fan out over a user's own characters and corporations, a small, bounded set, and it has a different result shape (a Map with nulls dropped).
- [`src/data/market-prices/ingest.ts:106`](../../src/data/market-prices/ingest.ts#L106) — sequential batch-insert loop, not a concurrency pool
- [`src/composition/pipelines/sde-pipeline.ts:49`](../../src/composition/pipelines/sde-pipeline.ts#L49) — sequential batch-insert loop, not a concurrency pool
- [`src/data/eve-data/sde-io.ts:32`](../../src/data/eve-data/sde-io.ts#L32) — sequential batch-insert loop, not a concurrency pool

</details>

**Home.** `src/lib/fan-out.ts (beside mapByIdDroppingNulls), with tests in src/lib/fan-out.test.ts`

**Boundary check.** src/lib/** is the lib zone, whose rule allows only config; the new function imports nothing. Consumers:
- src/data/market-prices, src/data/market-history and src/data/eve-data are data zones; the 'data' rule allows lib.
- src/composition/map-affiliation-access.ts and character-authorization.ts are in the composition zone; the 'composition' rule allows lib.
- fan-out.ts is not a SERVER_ROOT in src/lib/server-only-boundary.test.ts and carries no server-only marker, so it stays importable by any of these.

**API sketch.**

```ts
/**
 * Runs `worker` over `items` with at most `limit` calls in flight and returns
 * results in input order. After the first rejection no new item is claimed and
 * that error is rethrown (in-flight calls finish unobserved).
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]>;
// runners = Math.min(Math.max(1, Math.floor(limit)), items.length); empty input -> [] without calling worker
```

**Migration steps.**

1. Add mapConcurrent to src/lib/fan-out.ts. Base it on the market-prices runConcurrent: a cursor, a `failed` flag checked before each claim, set in a catch and rethrown, plus results[index] = await worker(item, index). Clamp the limit to at least 1 so limit 0 cannot silently return holes. Add its tests to fan-out.test.ts.
2. src/data/market-prices/source.ts:
- Replace both runConcurrent calls (192, 210) with `await mapConcurrent(...)`.
- Delete runConcurrent (65-91).
- Keep the budgetExhausted check and the fallbackNeeded push inside the per-type worker.
3. src/data/market-history/source.ts: replace the call at 76 and delete runConcurrent (50-66). The `if (budgetExhausted) return;` stays at the top of the worker.
4. src/data/market-prices/refresh-on-view.ts: replace mapBounded at 113 with mapConcurrent (same signature and order semantics) and delete mapBounded (73-89).
5. src/data/eve-data/entity-names.ts: in resolveEntityNamesBounded, replace the inline pool with `const resolved = await mapConcurrent(unique, RESOLVE_CONCURRENCY, resolveOne)` and build the record from unique[i] and resolved[i], skipping nulls. The strict variant becomes fail-fast.
6. src/composition/map-affiliation-access.ts:
- Replace the pool (40-55) with `await mapConcurrent(mapIds, DELIVERY_CONCURRENCY, async (mapId) => { const remaining = deadline - Date.now() - FINALIZE_RESERVE_MS; if (remaining <= 0) return; try { ...unchanged... } catch {...} })`.
- The claim is synchronous, so checking right after the claim is equivalent to checking before it.
7. src/composition/character-authorization.ts:
- Name the literal 4 (for example AUTHORIZATION_CONCURRENCY).
- Replace the pool (37-50) with mapConcurrent over `due`, whose worker returns early when Date.now() >= deadline, then claims, then runs the existing try/catch.
- Keep claimAuthorization outside the try, as today, so a store failure still propagates; it now stops sibling claims.

**Tests.** Add to src/lib/fan-out.test.ts:
- In-flight calls never exceed the limit (max active === limit for n > limit).
- Results come back in input order when completions are out of order.
- Empty input returns [] without calling the worker.
- A limit above n spawns only n runners.
- The first rejection is rethrown and no item after it is claimed (worker call count < n).
- A limit of 0 is clamped to 1.

Existing guards that must stay green:
- entity-names.test.ts 35-55 (maxActive 8, 20 calls) and the strict rejection tests.
- map-affiliation-access.test.ts 94-115 (peak 4, {processed 20, failed 4}, last timeoutMs 3000).
- market-prices source.test.ts 310+ (budget mid-batch to Fuzzwork) and 437+ (bulk budget fallback).
- market-history source.test.ts 111+ (budget stops dispatching).
- refresh-on-view.test.ts 177+.
- character-authorization.test.ts.

Add a character-authorization case: when claimAuthorization rejects, no further candidates are claimed.

**Notes.** Behaviour that must be preserved:
- Workers that must not abort keep their own catch: market-prices per-type, market-history, refresh-on-view, the lenient entity names path and map-affiliation.
- The market-prices per-type worker must still push budget-skipped ids to fallbackNeeded, so the budget check cannot move into the primitive.
- map-affiliation-access still passes Math.min(DELIVERY_TIMEOUT_MS, remaining) as timeoutMs.

Intended behaviour changes (both fixes; market-prices is the correct copy):
- character-authorization and strict entity-name resolution stop claiming new items after a rejection.
- map-affiliation spawns min(4, n) runners instead of always 4 (no observable effect).
- Entity-name record keys are now inserted in input order rather than completion order (the tests compare with toEqual).

No stopOnError or shouldStop options: no current caller needs them.

<sub>Reported by: area:composition, area:data-eve, area:data-services, concern:efficiency, concern:esi-sync, concern:generic-utils, dupes-triage-2.</sub>

<a id="p104"></a>

## P104: Use the existing mapByIdDroppingNulls at the five hand-rolled id fan-outs instead of adding mapById

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -18 / +3.
- **Depends on:** —
- **Existing primitive:** `src/lib/fan-out.ts:mapByIdDroppingNulls`

**Problem.** src/lib/fan-out.ts mapByIdDroppingNulls is used in character-sheet, industry-jobs, skill-queue and board-view. Five other fan-outs still hand-write `Promise.all(ids.map(async id => [id, await get(id)] as const))` into a Map, or an index-aligned `perOwner[i] ?? []` variant:
- skill-queue/queries.ts uses the helper for getSkillsForCharacters and hand-rolls getSkillLevelsForCharacters six lines lower.
- owned-assets listCharacterAssetRows hand-rolls what board-view's fresh path already does with mapByIdDroppingNulls(readOwnerAssetRows).
- owned-structures getCorpStructures, character-sheet refresh structure reads and owned-blueprints-sync corp evidence are the same fan-out.
- owned-blueprints-sync also builds explicit null entries for corps that are not by-location, which the consumer cannot tell from absent ones.

**Verifier revision.** The hand-rolled `new Map(await Promise.all(ids.map(async id => [id, await get(id)] as const)))` sites are real, but a new keep-all mapById is not needed. mapByIdDroppingNulls<T> already serves every cited site. For non-nullable getters (getCorpStructureRows -> CorpStructureRow[], getOwnerAssetRows -> AssetRow[], port.readStructure -> SheetEsiRead) T is inferred as the non-null type and nothing is dropped. For the nullable getters (getCharacterSkillLevels, getCorpAssetEvidence), every consumer reads with `?? null`, so an absent entry and a null entry behave identically. That is why board-view.ts:30 and :33-35 already use mapByIdDroppingNulls on the fresh path for the same data that getSkillLevelsForCharacters and listCharacterAssetRows hand-roll on the cached path. The generic key type K is unnecessary because every key is a numeric character, corporation or structure id. The finding becomes 'bypasses the existing primitive'.

**Sites (10).**

- [`src/lib/fan-out.ts:1-11`](../../src/lib/fan-out.ts#L1-L11) — mapByIdDroppingNulls<T>(ids: number[], getter) uses Promise.all, keyed by id
- [`src/features/skill-queue/queries.ts:60-67`](../../src/features/skill-queue/queries.ts#L60-L67) — getSkillLevelsForCharacters keeps nulls; sibling getSkillsForCharacters (36-40) uses the helper
- [`src/features/owned-structures/queries.ts:30-37`](../../src/features/owned-structures/queries.ts#L30-L37) — getCorpStructures; the getter returns CorpStructureRow[] and is never null
- [`src/features/owned-assets/queries.ts:95-101`](../../src/features/owned-assets/queries.ts#L95-L101) — listCharacterAssetRows: index-aligned perOwner[i] ?? []; the getter returns AssetRow[]
- [`src/features/character-sheet/refresh.ts:123-125`](../../src/features/character-sheet/refresh.ts#L123-L125) — structure reads into new Map(reads); SheetEsiRead is a non-null union
- [`src/composition/sync/owned-blueprints-sync.ts:37-40`](../../src/composition/sync/owned-blueprints-sync.ts#L37-L40) — evidence keyed by corporationId with explicit null for non-by-location corps
- [`src/composition/board/board-view.ts:26-37, 54-66`](../../src/composition/board/board-view.ts#L26-L37) — The fresh path already uses mapByIdDroppingNulls for the same getters, and the consumers read with `?? null` / `?? []`. Drift evidence.
- [`src/composition/sync/skills-sync.ts:51-56`](../../src/composition/sync/skills-sync.ts#L51-L56) — consumer reads levelsMap.get(id) ?? null
- [`src/composition/sync/corp-structures-sync.ts:63-65, 135`](../../src/composition/sync/corp-structures-sync.ts#L63-L65) — consumer reads rows ?? []
- [`src/features/owned-blueprints/queries.ts:59-63`](../../src/features/owned-blueprints/queries.ts#L59-L63) — consumer reads evidenceByCorp.get(id) ?? null

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/corp-holdings/context-sync.ts:110-120`](../../src/data/corp-holdings/context-sync.ts#L110-L120) — Folds reads straight into a Record of ok-only names via step.kind. A Map intermediate would add a step and save nothing.
- [`src/composition/corp-viewer.ts:91`](../../src/composition/corp-viewer.ts#L91) — An index-aligned array consumed by position in members.map((id, i) => ...), not a by-id map.
- [`src/composition/board/board-view.ts:31, 33, 37`](../../src/composition/board/board-view.ts#L31) — The sync-state Promise.all arrays are consumed by index i, not by id.

</details>

**Home.** `src/lib/fan-out.ts (existing mapByIdDroppingNulls). The only change there is widening ids to readonly number[].`

**Boundary check.** Home zone lib, which imports nothing. Consumers:
- features/skill-queue, features/owned-structures, features/owned-assets, features/character-sheet: features allow includes lib, and character-sheet/queries.ts and skill-queue/queries.ts already import @/lib/fan-out.
- composition/sync/owned-blueprints-sync: composition allow includes lib, and composition/board/board-view.ts already imports it.

**API sketch.**

```ts
export async function mapByIdDroppingNulls<T>(ids: readonly number[], getter: (id: number) => Promise<T | null>): Promise<Map<number, T>>; // unchanged except readonly ids
```

**Migration steps.**

1. Widen fan-out.ts `ids: number[]` to `readonly number[]`. Add a test that a non-nullable getter returning [] keeps its entry.
2. skill-queue/queries.ts 60-67: `return mapByIdDroppingNulls(characterIds, getCharacterSkillLevels)`. Change the return type to Map<number, Record<string, number>>. The consumers in board-view.ts:56 and skills-sync.ts:55 already use `?? null`.
3. owned-structures/queries.ts 30-37: `return mapByIdDroppingNulls(corporationIds, getCorpStructureRows)`.
4. owned-assets/queries.ts 95-101: `return mapByIdDroppingNulls(characterIds, (ownerId) => getOwnerAssetRows({ ownerType: 'character', ownerId }))`.
5. character-sheet/refresh.ts 123-125: `const reads = await mapByIdDroppingNulls(readIds, (id) => port.readStructure(id, accessToken))`, and pass `reads` instead of new Map(reads).
6. owned-blueprints-sync.ts 37-40: `const evidence = await mapByIdDroppingNulls(viewer.scope.corps.filter((g) => g.blueprints.kind === 'by-location').map((g) => g.corporationId), getCorpAssetEvidence)`. getOwnedBlueprintMap's ReadonlyMap<number, CorpAssetEvidence | null> parameter accepts it, and it reads with `?? null`.

**Tests.** src/lib/fan-out.test.ts: add a case where a getter returns [] and the entry is kept, and a case with readonly ids. The existing 'keeps falsy-but-non-null' case already covers 0 and ''.

Existing guards:
- src/composition/board/board-view.db.test.ts
- src/composition/sync/corp-structures-sync.test.ts
- src/features/character-sheet/refresh.test.ts
- src/features/owned-assets/queries.db.test.ts
- src/composition/sync/blueprint-snapshot.db.test.ts (blueprint evidence)
- src/composition/coverage.test.ts (getOwnedBlueprintDetailOnView)
- src/app/api/problem-matrix.test.ts (mocks getCorpStructures)

**Notes.** Behavior at each changed site:
- skill levels: null entries become absent, and every consumer coalesces with `?? null`.
- owned-blueprints evidence: corps that are not by-location and corps with no evidence become absent, and the consumer coalesces with `?? null`.
- structures, assets and SheetEsiRead: the getters never return null, so the maps are identical.
- Concurrency (Promise.all) and duplicate-id last-wins are unchanged.

Keep the name mapByIdDroppingNulls. It stays accurate for non-null getters (nothing to drop), and renaming would touch nine call sites for no behavior gain.

If a site ever needs to tell 'read returned null' from 'not read', that would be the real second consumer that justifies a keep-all variant. No such site exists today. Concurrency bounding, if ever needed, belongs to the separate worker-pool opportunity.

<sub>Reported by: area:features-owned, concern:generic-utils, dupes-triage-1.</sub>

<a id="p137"></a>

## P137: Add src/lib/graph.ts (Neighbours, breadthFirst, pathTo) and route trade-hubs, pilot-path and chain-collapse through it; leave halo's budgeted per-exit expansion as is

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -85 production lines (distancesFrom 19, scanTowardTargets/reconstructPath/PathScan 42, derivePilotPath/PilotPathInput 17, componentFrom 14), +45 for lib/graph.ts and about +10 at call sites; net about -30 production, with tests moved rather than added
- **Depends on:** —

**Problem.** Three modules hand-write breadth-first or reachability walks over a neighbour function or an adjacency map:
- trade-hubs.distancesFrom: a single-source queue BFS that returns depths.
- pilot-path.scanTowardTargets with reconstructPath: a multi-source, level-synchronous BFS with a depth cap, an early stop and parent-path reconstruction.
- chain-collapse.componentFrom: a DFS component set that a Convex mutation reaches through decideCollapse.
The neighbour function type is spelled inline nine times across data/eve-data and mapper. derivePilotPath is a production export used only by pilot-path.test.ts.

**Verifier revision.** The traversals are real and hand-written, but the four are not one algorithm, and one primitive cannot cover all of them without hiding semantics:
- trade-hubs.distancesFrom is a single-source BFS that returns depths.
- pilot-path.scanTowardTargets is a multi-source, level-synchronous BFS with a 15-jump cap, an all-targets-reached stop checked once per level, and first-discovery parents.
- chain-collapse.componentFrom is order-insensitive reachability, so BFS and DFS give the same Set.
- halo-model is a different algorithm. It runs per-exit round-robin frontiers under per-source and global claim budgets, and a node rejected by a budget stays unseen so a later exit can claim it. Its claim order is observable: deriveHalo's systems and links feed haloSignature and the layout facts. halo-model.test.ts:64 and :110 assert determinism and truncation at the caps.
Halo could map onto a generic BFS with a stateful `admit` callback that increments counters when it returns true. That moves the budget accounting into a callback with an 'admit is called once per discovery attempt and true means claimed' contract, which costs more clarity than it saves.
The survivor is therefore narrowed to trade-hubs, pilot-path and chain-collapse, plus a shared Neighbours type for the nine inline `(id: number) => readonly number[]` annotations. That is three real consumers, which meets the AGENTS.md bar. Efficiency is not a concern either way: trade-hubs runs 5 lazy BFS passes over the roughly 5.4k gate-connected systems once per asset version.

**Sites (7).**

- [`src/data/eve-data/trade-hubs.ts:37-55, 68-91`](../../src/data/eve-data/trade-hubs.ts#L37-L55) — distancesFrom: single-source index-queue BFS that returns Map<id, depth>, run lazily once per hub inside buildHubJumpIndex; neighbours type inlined at lines 39 and 69
- [`src/mapper/tracking/pilot-path.ts:5-9, 11-67, 79-84, 112-139`](../../src/mapper/tracking/pilot-path.ts#L5-L9) — PilotPathInput and OutboundArrowInput inline the neighbours type; scanTowardTargets seeds sorted drawn ids, caps at PILOT_PATH_MAX_JUMPS, stops per level once all targets are seen and records first-discovery cameFrom; reconstructPath walks back to a drawn id; derivePilotPath (56-67) is used only by tests; deriveOutboundArrows (112-139) is the production consumer
- [`src/data/maps/chain-collapse.ts:29-42, 52-68`](../../src/data/maps/chain-collapse.ts#L29-L42) — componentFrom: stack DFS over Map adjacency; only Set membership is used afterwards; called by convex/mapAuthoringCollapse.ts:117 via decideCollapse
- [`src/data/eve-data/universe-assets-client.ts:16-21, 74-87`](../../src/data/eve-data/universe-assets-client.ts#L16-L21) — UniverseAssets.neighbours(id): readonly number[], the neighbour source the walks consume; feeds buildHubJumpIndex
- [`src/mapper/chain/use-map-chain-halo.ts:58-62`](../../src/mapper/chain/use-map-chain-halo.ts#L58-L62) — neighboursOf, which feeds the outbound-arrow BFS via OutboundArrowProvider
- [`src/mapper/tracking/OutboundArrowProvider.tsx:20`](../../src/mapper/tracking/OutboundArrowProvider.tsx#L20) — another inline neighbours type
- [`src/mapper/chain/use-map-chain.ts:32`](../../src/mapper/chain/use-map-chain.ts#L32) — another inline neighbours type

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/halo/halo-model.ts:57-119`](../../src/mapper/halo/halo-model.ts#L57-L119) — Different algorithm: per-exit round-robin frontiers with per-source and global claim budgets and admit-before-mark semantics (claimable, 77-83). Claim order is observable through haloSignature and the layout facts. Only its HaloInput.neighbours (59, 72) should adopt the shared Neighbours type.
- [`src/mapper/chain/use-map-chain-halo.ts:29-43`](../../src/mapper/chain/use-map-chain-halo.ts#L29-L43) — feeds deriveHalo, so excluded together with halo
- [`src/data/eve-data/tree-resolver.ts:203-273`](../../src/data/eve-data/tree-resolver.ts#L203-L273) — recursive blueprint-tree DFS with cycle detection and path-scoped visited (add, then delete on unwind); not a reachability walk
- [`src/lib/neon-cold-start-retry.ts:47-48`](../../src/lib/neon-cold-start-retry.ts#L47-L48) — bounded search over error causes, not a graph of ids

</details>

**Home.** `src/lib/graph.ts`

**Boundary check.** Home zone: lib, whose rule is {from: lib, allow: [config]}, and the module imports nothing. data/eve-data/trade-hubs.ts and data/maps/chain-collapse.ts are in zone data, whose rule allows lib. src/mapper/tracking/pilot-path.ts is in mapper, whose rule allows lib. Convex reaches chain-collapse through data, and the convex rule allows data and lib, so the transitive lib import is also legal. lib is the only zone that every consumer may import: data may not import mapper, and mapper/lib/pair-key.ts is mapper-only. The module must stay runtime-pure (no React, no env) because it runs inside the Convex isolate.

**API sketch.**

```ts
export type Neighbours = (id: number) => readonly number[];
export interface Reached { readonly depth: number; readonly parent: number | null }
/** Level-synchronous BFS. Sources are depth 0 in the order given. The first discovery wins the parent. Map insertion order is discovery order. Stops after the level at maxDepth, or after the first completed level in which every id in `targets` is reached. */
export function breadthFirst(sources: Iterable<number>, neighbours: Neighbours, options?: { readonly maxDepth?: number; readonly targets?: ReadonlySet<number> }): ReadonlyMap<number, Reached>;
/** Source-to-target inclusive path through parents; null when the target was not reached. */
export function pathTo(reached: ReadonlyMap<number, Reached>, target: number): number[] | null;
```

**Migration steps.**

1. Add src/lib/graph.ts and src/lib/graph.test.ts first.
2. trade-hubs.ts: delete distancesFrom. Build each hub's distances as breadthFirst([hub.id], neighbours) and read `.get(systemId)?.depth ?? null`. Type the parameter as Neighbours.
3. pilot-path.ts: delete PathScan, scanTowardTargets and reconstructPath. In deriveOutboundArrows, call `breadthFirst([...drawnSystemIds].sort((a, b) => a - b), neighbours, { maxDepth: PILOT_PATH_MAX_JUMPS, targets: new Set(offMapLive.keys()) })` and use pathTo(reached, pilotSystemId). Keep the sorted seed order, because first-discovery parents decide which edge an arrow mounts on. Type both input interfaces with Neighbours.
4. Delete derivePilotPath and PilotPathInput (production-unused) and move their test cases (inclusive path, null past 15 jumps, empty drawn set) into graph.test.ts against breadthFirst and pathTo.
5. chain-collapse.ts: replace componentFrom with `new Set(breadthFirst([start], (id) => adjacency.get(id) ?? []).keys())`.
6. Retype the remaining inline annotations to Neighbours: halo-model.ts 59/72, OutboundArrowProvider.tsx:20, use-map-chain.ts:32. Do not touch halo's expansion logic.

**Tests.** New src/lib/graph.test.ts:
- depth and parent for a single source;
- multi-source discovery order follows the given source order;
- maxDepth cut-off;
- the targets stop completes the current level;
- unreachable target gives a null path;
- pathTo on a source returns [source].
Guards that must stay green unchanged: src/data/eve-data/trade-hubs.test.ts:4 (lazy indexing, ordering, reuse), src/mapper/tracking/pilot-path.test.ts:68 (mounting, dedupe, liveness), src/data/maps/chain-collapse.test.ts:28 and :71, and convex/mapAuthoringCollapse tests via decideCollapse. Halo tests are untouched.

**Notes.** Behaviour to preserve:
- pilot-path seeds sorted ascending, and parents are first-discovery.
- pilot-path's early stop is checked before each level. That is equivalent to checking after each completed level, which can only add discoveries and never change parents.
- trade-hubs only reads depths.
- chain-collapse only uses Set membership, so BFS replacing DFS is safe.
No drift bug was found among the copies.
The Reached objects cost about 27k small allocations once per universe-asset version for trade-hubs. If that matters, breadthFirst can keep depth and parent in two Maps internally.
Do not route halo through the helper. Its per-exit and total budgets, and a rejected node staying claimable by a later exit, are its defining semantics.

<sub>Reported by: gap:graph-traversal-and-mapper-layout.</sub>

<a id="p151"></a>

## P151: Add errorMessage(unknown) to src/lib/failure.ts and route the four copies plus errorCode's fallback through it

- **Status:** [x] done
- **Category:** error-handling · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -12 in callers (two 3-line helpers plus blanks deleted, three inline ternaries shortened), +4 helper, +10 test
- **Depends on:** —
- **Existing primitive:** `src/lib/failure.ts (existing error-model home)`

**Problem.** The same unknown-to-message conversion is written five times: a private errorMessage in the housekeeping pipeline, a private errText in GSC ingest, inline in the layout worker's failure path, inline in the Convex character-location sync action, and as the non-ConvexError fallback in convex/lib/errorCode. The copies have not drifted yet, but there is no canonical home, so every new catch site writes its own.

**Sites (5).**

- [`src/composition/pipelines/housekeeping.ts:113-115`](../../src/composition/pipelines/housekeeping.ts#L113-L115) — private errorMessage(); called at 127 and 139
- [`src/data/gsc/ingest.ts:245-247`](../../src/data/gsc/ingest.ts#L245-L247) — private errText(); called at 205, 269, 297, 322
- [`src/mapper/layout/layout.worker.ts:31-38`](../../src/mapper/layout/layout.worker.ts#L31-L38) — inline at line 35 inside the fail() closure that posts LayoutWorkerFailure.message
- [`convex/characterLocationSync.ts:94-101`](../../convex/characterLocationSync.ts#L94-L101) — inline in the catch that builds the 'failed' SyncOutcome passed to finishSync
- [`convex/lib/errorCode.ts:3-10`](../../convex/lib/errorCode.ts#L3-L10) — ConvexError code first; line 9 is the same fallback expression

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/neon-cold-start-retry.ts:65`](../../src/lib/neon-cold-start-retry.ts#L65) — keeps only the first line of the message; different summary semantics
- [`src/scripts/map-replay.ts:260`](../../src/scripts/map-replay.ts#L260) — passes the raw non-Error value to console.error (no String()); CLI output, different intent
- [`src/scripts/project-map-access.ts:31`](../../src/scripts/project-map-access.ts#L31) — same as map-replay: raw value to console.error
- [`src/mapper/signatures/use-scanner-paste.ts:15-24`](../../src/mapper/signatures/use-scanner-paste.ts#L15-L24) — String(error) on purpose so substring matching sees the full ConvexError text ('Error: ...' plus data); not a message extractor
- [`src/composition/board/net-worth-nightly.ts:39`](../../src/composition/board/net-worth-nightly.ts#L39) — String(error) yields 'Error: msg'; adopting errorMessage would change log format, so it is optional and out of scope
- [`src/data/industry-indices/ingest.ts:99`](../../src/data/industry-indices/ingest.ts#L99) — logs constructor name, not message
- [`src/data/telemetry/capability.ts:165-166`](../../src/data/telemetry/capability.ts#L165-L166) — walks the cause chain for error names; different concept
- [`scripts/profile-sites-dev.mjs:508`](../../scripts/profile-sites-dev.mjs#L508) — plain .mjs outside src and outside every fallow zone; cannot import TS lib
- [`scripts/profile-sites-suite.mjs:58`](../../scripts/profile-sites-suite.mjs#L58) — same: standalone .mjs script

</details>

**Home.** `src/lib/failure.ts (existing error-model module, no imports)`

**Boundary check.** Home zone is lib (src/lib/**), whose rule `{from: lib, allow: [config]}` is satisfied because failure.ts imports nothing. Consumers: composition (housekeeping.ts), rule `from: composition` allows lib. data (gsc/ingest.ts), rule `from: data` allows lib. mapper (layout.worker.ts), rule `from: mapper` allows lib. convex (characterLocationSync.ts, lib/errorCode.ts), rule `from: convex, allow: [platform/esi, platform/auth, data, lib]`. All four imports are legal.

**API sketch.**

```ts
// src/lib/failure.ts
/** The message of an Error, or the string form of anything else thrown, for logs and stored outcomes. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// convex/lib/errorCode.ts
export function errorCode(error: unknown): string {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | null)?.code;
    if (typeof code === 'string') return code;
  }
  return errorMessage(error);
}
```

**Migration steps.**

1. Add `errorMessage` to src/lib/failure.ts after isAppFailure, and add a describe block to src/lib/failure.test.ts.
2. convex/lib/errorCode.ts: import { errorMessage } from '@/lib/failure' and replace line 9 with `return errorMessage(error);`.
3. convex/characterLocationSync.ts:96-100: replace the inline ternary with `errorMessage(error)`. Keep message semantics; do not switch to errorCode, which would change the stored outcome string for ConvexErrors.
4. src/composition/pipelines/housekeeping.ts: delete the private errorMessage (113-115) and import it from '@/lib/failure'. The call sites at 127 and 139 are unchanged.
5. src/data/gsc/ingest.ts: delete errText (245-247), import errorMessage, and rename the four calls (205, 269, 297, 322).
6. src/mapper/layout/layout.worker.ts:35: `message: errorMessage(error)`, importing from '@/lib/failure'. This is the first '@/' import in the worker; the Next bundler resolves tsconfig paths for `new Worker(new URL(...))` entries the same way as for the main bundle.
7. Run pnpm check through test-runner.

**Tests.** Add to src/lib/failure.test.ts: an Error gives its message; a thrown string is returned as-is; null/undefined give 'null'/'undefined'; a plain object gives '[object Object]'. Existing guards: src/composition/pipelines/housekeeping.test.ts:153,177 (error strings in task results), convex/characterLocationSync.test.ts:260,715 (outcome.error matches the thrown message), src/data/gsc/ingest.test.ts, convex/lib/mapChainCleanup.test.ts and convex/mapAuthoringSweep.test.ts (errorCode callers).

**Notes.** No drift: all five copies are identical in behavior, so the migration is behavior-preserving. Keep errorCode's ConvexError-first branch; only its fallback delegates. failure.ts was chosen over a new src/lib/error-message.ts because it is the existing error-model home and already has a test file. A new file would need its own test to satisfy fallow coverage-gaps (requireAllFiles).

<sub>Reported by: area:convex, area:data-services, area:mapper-surface.</sub>

<a id="p249"></a>

## P249: Move FailureResult next to AppFailure in lib/failure and use it for the pass/fail guard unions

- **Status:** [x] done
- **Category:** contracts-validation · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -12 / +3
- **Depends on:** —
- **Existing primitive:** `src/lib/failure.ts:AppFailure`

**Problem.** The failure branch `{ ok: false; failure: AppFailure }` is re-declared in 13 places. The bare guard `{ ok: true } | { ok: false; failure: AppFailure }` appears in 6 of them: same-origin, service-auth, corp-role-gates (3 times), save-boundary (twice) and mutation-route. corp-role-gates and save-boundary each declare a private alias and then re-spell the union in their exported signatures, because exporting a private alias in a signature trips private-type-leaks. The canonical FailureResult already exists, but in src/app/api/mutation-route.ts, which no core zone may import.

**Verifier revision.** The duplication is real: `{ ok: false; failure: AppFailure }` is spelled at 13 places across lib, transport, platform/auth, features, composition and api. Some of it comes from tooling. private-type-leaks is set to error and flags exported signatures that reference same-file private types, which is likely why corp-role-gates and save-boundary declare a private alias and then re-spell the union in their exported signatures. The proposed generic `Checked<T> = ({ ok: true } & T) | ...` is the wrong design. Intersections make hover types and error messages worse. It also does not fit the variants: rate-limit narrows the failure to rateLimitedFailure's return type, ReadJsonBodyResult carries zodError, and mutation-route's parse branch carries data. Moving the existing FailureResult to lib/failure.ts, plus a bare pass/fail alias, captures the whole dedupe with no new indirection. The payoff is low because there is no behavior or drift risk; it is hygiene only.

**Sites (8).**

- [`src/app/api/mutation-route.ts:7-14, 26-31`](../../src/app/api/mutation-route.ts#L7-L14) — FailureResult/AuthorizationSuccess defined in the api zone; parse result spelled again at 12 and 30
- [`src/composition/corp-role-gates.ts:8, 14, 32, 36`](../../src/composition/corp-role-gates.ts#L8) — private CorpRoleGateResult, then re-spelled in two exported signatures
- [`src/features/custom-structures/save-boundary.ts:5, 18-20`](../../src/features/custom-structures/save-boundary.ts#L5) — private InputCheck, then re-spelled in the exported signature
- [`src/composition/route-guards.ts:14-16, 44-46`](../../src/composition/route-guards.ts#L14-L16) — SessionCheckResult, UserIdCheckResult (success branches carry payloads)
- [`src/platform/auth/same-origin.ts:7`](../../src/platform/auth/same-origin.ts#L7) — SameOriginResult, used only in this file
- [`src/lib/service-auth.ts:16-19`](../../src/lib/service-auth.ts#L16-L19) — inline bare guard union
- [`src/transport/route-body.ts:4-10`](../../src/transport/route-body.ts#L4-L10) — ParsedFormBody, plus ReadJsonBodyResult whose failure branch adds zodError
- [`src/features/wormhole-sites/sites-query.ts:7-9`](../../src/features/wormhole-sites/sites-query.ts#L7-L9) — missed: SitesQueryParse

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/rate-limit.ts:87-89`](../../src/lib/rate-limit.ts#L87-L89) — The failure is narrowed to ReturnType<typeof rateLimitedFailure> (it carries retryAfterSeconds), so it is a different type. Keep it.
- [`src/features/custom-structures/validation.ts:12`](../../src/features/custom-structures/validation.ts#L12) — { ok: false; reason: string } is a different contract
- [`src/composition/map-access-update.ts:26-36`](../../src/composition/map-access-update.ts#L26-L36) — A reason-coded result, not an AppFailure
- [`src/components/ui/terminal-search.tsx:11`](../../src/components/ui/terminal-search.tsx#L11) — ParseErr<Err> carries a typed error; the ui zone may not import lib anyway

</details>

**Home.** `src/lib/failure.ts (existing; already exports AppFailure)`

**Boundary check.** Zone lib may import only config, and failure.ts imports nothing new. Every consumer may import lib:
- lib (service-auth.ts): same zone.
- transport (route-body.ts): from:transport allows lib.
- platform/auth (same-origin.ts): from:platform/auth allows lib.
- composition (corp-role-gates.ts, route-guards.ts): from:composition allows lib.
- features (save-boundary.ts, sites-query.ts): from:features allows lib.
- api (mutation-route.ts): from:api allows lib.

**API sketch.**

```ts
// src/lib/failure.ts
export type FailureResult = { ok: false; failure: AppFailure };
export type CheckResult = { ok: true } | FailureResult;

// usage
export type SessionCheckResult = { ok: true; session: BetterAuthSession } | FailureResult;
export type ReadJsonBodyResult<T> = { ok: true; data: T } | (FailureResult & { zodError?: z.ZodError });
```

**Migration steps.**

1. Add FailureResult and CheckResult to src/lib/failure.ts.
2. src/app/api/mutation-route.ts: delete the local FailureResult (8) and import it from lib. AuthorizationSuccess stays local, or becomes Extract<CheckResult, { ok: true }>.
3. Bare guards:
- corp-role-gates.ts: delete CorpRoleGateResult (8) and use Promise<CheckResult> at 14, 32 and 36.
- save-boundary.ts: delete InputCheck (5) and use CheckResult at 7 and 20.
- same-origin.ts: SameOriginResult (7) becomes CheckResult. Delete the alias if nothing outside the file uses it.
- service-auth.ts: CheckResult at 19.
4. Payload unions keep their explicit success branch and use FailureResult for the failure branch: route-guards.ts:14-16 and 44-46, route-body.ts:4-6 and 8-10 (intersect zodError), sites-query.ts:7-9.
5. Leave rate-limit.ts:87-89 unchanged. Run pnpm check: Fallow unused-types and private-type-leaks must stay green after the aliases are removed.

**Tests.** Type-only change, so no new runtime tests. Existing guards that must stay green:
- src/app/api/mutation-route.test.ts
- src/composition/route-guards.test.ts
- src/lib/service-auth.test.ts
- src/lib/failure.test.ts
- the same-origin and route-body tests
- src/app/api/same-origin-coverage.test.ts
- tsc via pnpm check

**Notes.** No behavior differences between the sites. Do not adopt the generic `Checked<T>` intersection: it obscures hover types and does not express ReadJsonBodyResult's zodError, rate-limit's narrowed failure, or mutation-route's data branch.

admin-mutation.ts:4 uses Extract<SessionCheckResult, { ok: true }>['session'], which keeps working with the explicit success branch.

I could not confirm by running Fallow whether moving the type changes how Fallow counts the existing in-file-only exported aliases (SameOriginResult, CheckRateLimitResult, ParsedFormBody, SitesQueryParse). pnpm check decides.

<sub>Reported by: area:composition, concern:request-pipeline.</sub>

<a id="p145"></a>

## P145: Promote hasTimeoutAbort to a chain-aware isTimeoutError in lib and use it in every timeout classifier

- **Status:** [x] done
- **Category:** error-handling · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -15/+20: one module moved, three local predicates deleted, one new test file.
- **Depends on:** —
- **Existing primitive:** `src/lib/neon-cold-start-retry.ts:hasTimeoutAbort; src/lib/fetch-with-timeout.ts:fetchWithTimeout`

**Problem.** There are four predicates that decide whether an error is a timeout. hasTimeoutAbort in neon-cold-start-retry.ts does a bounded breadth-first walk over cause and sourceError and is correct. eve-sso.isTimeoutError duck-types the top-level name. affiliation-source.isTransientFetchFailure and esi-refresh-worker.retryCode require a top-level `instanceof DOMException`. The worker's runners read and write Postgres through the Neon HTTP driver, whose fetchFunction is fetchWithTimeout (src/db/index.ts:34-42). A DB timeout therefore reaches retryCode wrapped as DrizzleQueryError(name 'Error').cause = NeonDbError, whose sourceError is DOMException('TimeoutError'). retryCode returns 'Error', so job rows, dead-letter alerts and the worker log record 'Error' instead of 'timeout'. The timeout concept also lives in a Neon-specific module, so platform/auth and composition copy it rather than import it.

**Verifier revision.** Most of the claimed walker drift does not hold up. pg-errors.hasCode only needs the cause chain: SQLSTATEs sit on NeonDbError.code, which it reaches through DrizzleQueryError.cause, and NeonDbError.sourceError only ever holds the fetch failure. isNeonColdStartError's `cause ?? sourceError` is equivalent to visiting both fields, because NeonDbError's constructor takes only a message and never sets cause (checked in @neondatabase/serverless 1.1.0: index.d.ts declares `constructor(message: string)`, and the 'Error connecting to database' path sets only sourceError). errorClassOf's linear walk is deliberate: its 'innermost name' label assumes a linear chain, and widening it would change dashboard labels, which the proposal itself forbids. eve-sso and affiliation-source only ever see top-level timeouts, because fetchWithTimeout rejects with the DOMException itself and esiFetch/dispatch do not wrap it, and since the abort reason is a same-realm global DOMException the cross-realm concern does not apply. classifyFetchFailure would serve two different vocabularies (RefreshFailureClass and the worker's free-form code). timeoutSignal({signal, clear}) cannot help upstash, because Upstash's `signal` option is a per-request factory with no settle hook, and the pending timers are bounded at 1.5–2 s, so they are not a leak. map-creation also needs a rejecting race promise and already clears its timer. What does survive: three classifiers re-implement 'is this a timeout' at top level when the chain-aware hasTimeoutAbort exists, and one of them is wrong in practice. esi-refresh-worker.retryCode receives runner DB failures as DrizzleQueryError (name 'Error') → NeonDbError → sourceError DOMException TimeoutError, because Neon HTTP goes through fetchWithTimeout in src/db/index.ts. Those jobs are therefore retried and dead-lettered with failure code 'Error' instead of 'timeout'.

**Sites (9).**

- [`src/lib/neon-cold-start-retry.ts:43-56`](../../src/lib/neon-cold-start-retry.ts#L43-L56) — hasTimeoutAbort: 16-node breadth-first walk over cause and sourceError, name === 'TimeoutError'. This is the canonical implementation to promote.
- [`src/lib/neon-cold-start-retry.ts:72-73`](../../src/lib/neon-cold-start-retry.ts#L72-L73) — isNeonColdStartError calls hasTimeoutAbort first (stays a consumer)
- [`src/platform/auth/eve-sso.ts:124-131, 155-160`](../../src/platform/auth/eve-sso.ts#L124-L131) — local duck-typed top-level isTimeoutError; timeout else connection
- [`src/platform/auth/affiliation-source.ts:43-50`](../../src/platform/auth/affiliation-source.ts#L43-L50) — top-level instanceof DOMException TimeoutError among transient checks
- [`src/composition/sync/esi-refresh-worker.ts:76-81`](../../src/composition/sync/esi-refresh-worker.ts#L76-L81) — retryCode: top-level instanceof DOMException; wrapped DB timeouts fall through to error.name ('Error' for DrizzleQueryError)
- [`src/composition/sync/esi-refresh-worker.ts:180-185, 284-292`](../../src/composition/sync/esi-refresh-worker.ts#L180-L185) — retryCode feeds recordRetryableFailure (job failure code and dead-letter alert) and the per-job error log
- [`src/db/index.ts:34-42`](../../src/db/index.ts#L34-L42) — Neon fetchFunction is fetchWithTimeout, so DB timeouts reach callers wrapped as Drizzle → NeonDbError → sourceError
- [`src/lib/fetch-with-timeout.ts:20-39`](../../src/lib/fetch-with-timeout.ts#L20-L39) — origin of the DOMException TimeoutError; rejects with it at the top level for direct callers
- [`src/scripts/warm-neon-query.ts:2-11`](../../src/scripts/warm-neon-query.ts#L2-L11) — existing consumer of hasTimeoutAbort; must follow the rename

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/db/pg-errors.ts:4-13`](../../src/db/pg-errors.ts#L4-L13) — Walking the cause chain only is correct. Postgres SQLSTATEs live on NeonDbError.code, reached via DrizzleQueryError.cause; sourceError only holds the fetch failure.
- [`src/data/telemetry/capability.ts:154-173`](../../src/data/telemetry/capability.ts#L154-L173) — errorClassOf uses 'innermost name' label semantics that need a linear chain. Walking sourceError would change dashboard labels ('NeonDbError' → 'ECONNRESET'/'TimeoutError').
- [`src/lib/neon-cold-start-retry.ts:86-88`](../../src/lib/neon-cold-start-retry.ts#L86-L88) — `cause ?? sourceError` is not drift, because NeonDbError never sets cause
- [`src/transport/decode.ts:9-19`](../../src/transport/decode.ts#L9-L19) — Client-side fetch outcome. Covers AbortError as well as TimeoutError, always at the top level, so a chain-aware check adds nothing.
- [`src/components/composition/GlobalSearch.tsx:51-53`](../../src/components/composition/GlobalSearch.tsx#L51-L53) — AbortError thrown explicitly by platform/search, which cannot import lib
- [`src/lib/upstash.ts:35-42, 84`](../../src/lib/upstash.ts#L35-L42) — Upstash `signal` is a per-request factory with no completion hook, so {signal, clear} cannot be used. The timers are bounded at 1.5–2 s (REDIS_TIMEOUT_MS, MARKER_TIMEOUT_MS, RATE_LIMIT_REDIS_TIMEOUT_MS), so this is not a leak; at most unref the timer.
- [`src/composition/map-creation.ts:81-103`](../../src/composition/map-creation.ts#L81-L103) — Needs a rejecting race promise as well as the signal, and already clears its timer in finally. A shared helper would not simplify it.

</details>

**Home.** `src/lib/error-chain.ts (new module; the body moves from src/lib/neon-cold-start-retry.ts)`

**Boundary check.** The home is in the lib zone, whose rule `{from: lib, allow: [config]}` is met because the helper imports nothing. Every consumer zone may import lib: lib itself (neon-cold-start-retry.ts), platform/auth (eve-sso.ts, affiliation-source.ts; rule allows lib), composition (esi-refresh-worker.ts; rule allows lib) and scripts (warm-neon-query.ts; rule allows lib). platform/search and ui, which may import nothing, keep their local AbortError checks.

**API sketch.**

```ts
export function isTimeoutError(err: unknown): boolean; // breadth-first over cause and sourceError, at most 16 nodes, matches name === 'TimeoutError' on any node (identical to today's hasTimeoutAbort)
```

**Migration steps.**

1. Create src/lib/error-chain.ts by moving MAX_TIMEOUT_SEARCH_NODES and the hasTimeoutAbort body (neon-cold-start-retry.ts:43-56) into it, exported as isTimeoutError.
2. In neon-cold-start-retry.ts, import isTimeoutError, use it at line 73 and delete hasTimeoutAbort and its constant. Update src/scripts/warm-neon-query.ts to import isTimeoutError from '@/lib/error-chain'.
3. eve-sso.ts: delete the local isTimeoutError (124-131) and import the lib one. Line 158 is unchanged in meaning.
4. affiliation-source.ts: replace `(error instanceof DOMException && error.name === 'TimeoutError')` with `isTimeoutError(error)`.
5. esi-refresh-worker.ts retryCode: replace line 77 with `if (isTimeoutError(error)) return 'timeout';`. Keep the TypeError → 'connection' and error.name fallbacks.
6. Optionally unref the upstash timer as a separate one-line fix, using `(timer as { unref?: () => void }).unref?.()`. Keep the AbortController construction there, because Convex's runtime lacks AbortSignal.timeout.

**Tests.** Add src/lib/error-chain.test.ts covering a top-level DOMException TimeoutError, nesting via cause, nesting via sourceError, the DrizzleQueryError → NeonDbError → sourceError shape, a cyclic cause (must stop at 16 nodes), null and non-object input, and an AbortError that must not match. Move the hasTimeoutAbort cases out of src/lib/neon-cold-start-retry.test.ts (around lines 54 and 120). In src/composition/sync/esi-refresh-worker.test.ts, add a case where a runner rejects with a wrapped Neon timeout and expect failureCode 'timeout'. Existing guards that must stay green: src/platform/auth/eve-sso.test.ts:273 (top-level timeout → 'timeout') and src/platform/auth/affiliation-source.test.ts:126/152 (timeout → transient), plus src/scripts/warm-neon-query.test.ts.

**Notes.** Behavior changes the migration must accept: (1) worker jobs whose runner fails on a wrapped DB/HTTP timeout now record 'timeout' instead of 'Error', which is the intended fix. (2) affiliation-source now treats a wrapped timeout as a transient failure instead of rethrowing it; this is correct, since a timeout is transient. (3) The check becomes name-based instead of instanceof-based, so any Error named 'TimeoutError' counts; this matches hasTimeoutAbort today. Leave errorClassOf, hasCode and isNeonColdStartError's own walk alone. If an `errorChain` iterator is ever wanted, isNeonColdStartError is the only other natural user. Do not adopt the proposed classifyFetchFailure or timeoutSignal: each would have a single real consumer.

<sub>Reported by: area:lib-infra, area:platform, concern:esi-sync, concern:generic-utils.</sub>

<a id="p140"></a>

## P140: Move readWithRetries and a shared sleep into src/lib/retry.ts, let withColdStartRetry absorb warmNeon, and share the planner build-location read

- **Status:** [x] done
- **Category:** error-handling · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -60 / +40 (warm-neon loop, eve-status loop, 3 sleep helpers, 2 duplicate planner blocks removed; retry.ts, options and readBuildLocation added)
- **Depends on:** [P145](#p145)
- **Existing primitive:** `src/lib/neon-cold-start-retry.ts:withColdStartRetry`

**Problem.** A retry over a delay schedule (null or throw means retry) exists twice: readWithRetries in features/industry-planner, and a hand copy in data/eve-status, which may not import features. warmNeon copies the withColdStartRetry loop with the same MAX_ATTEMPTS=4, BASE_DELAY_MS=500 and backoff. That copy is the only reason pauseBeforeRetry and hasTimeoutAbort are exported. `new Promise((r) => setTimeout(r, ms))` is written as private helpers in map-creation, map-creation-client and map-replay, inline in eve-status, and inline in pauseBeforeRetry. The identical readWithRetries(apiFetch(buildLocationEndpoint …)) block appears three times in the planner. readWithRetries's abortable pause also has a latent bug. If the signal aborts during a read, the next pause adds an 'abort' listener to a signal that has already aborted, so the listener never fires and the pause waits the full 600 or 1800 ms. The listener is also never removed when the timer wins.

**Verifier revision.** The core holds. readWithRetries is stuck in features/industry-planner, and data/eve-status cannot import features (the data rule allows only data/eve-data, platform/*, transport, db, lib and config), so getNavServerStatus hand-copies the same null-means-retry delay loop (it does the same thing for [300, 900]). warmNeon copies withColdStartRetry's constants, 2**(attempt-1) backoff and pauseBeforeRetry exactly. The only differences are a wider predicate and a recovery log line. Its metric would be a no-op anyway, because the sink is configured only in src/instrumentation.node.ts, so scripts never set it. pauseBeforeRetry and hasTimeoutAbort are exported only for that copy. Three private one-line sleep/delay helpers and one inline sleep (eve-status) remain. The three planner buildLocation readWithRetries blocks are token-identical within one feature. Three parts are dropped. (1) The generic retryWhile: createIndustryProfile is an immediate retry with no delay or logging on 40001 inside one serializable statement, and withColdStartRetry interleaves its exhaustion and recovery metrics into the loop, so a generic loop would serve one 6-line site. (2) The single errorChain walker: pg-errors (cause only, depth 5), isNeonColdStartError (cause ?? sourceError, depth 10) and hasTimeoutAbort (breadth-first over both fields, 16 nodes, any object) walk the chain differently on purpose. The timeout check must find a TimeoutError on either branch so it can exclude a retry, and unifying the walkers changes how errors are classified. (3) map-creation's offset ladders. Readers with a delay schedule keep the readWithRetries name and signature, which avoids churn in four test mocks.

**Sites (13).**

- [`src/lib/neon-cold-start-retry.ts:1-2, 30-41, 58-70, 93-108`](../../src/lib/neon-cold-start-retry.ts#L1-L2) — canonical cold-start loop; pauseBeforeRetry has an inline sleep at 69
- [`src/scripts/warm-neon-query.ts:1-28`](../../src/scripts/warm-neon-query.ts#L1-L28) — same loop and constants; predicate isNeonColdStartError \|\| hasTimeoutAbort; logs 'recovered after N attempts'
- [`src/scripts/warm-neon.ts:12-15`](../../src/scripts/warm-neon.ts#L12-L15) — only caller of warmNeon (runs in build:vercel; no metric sink configured)
- [`src/instrumentation.node.ts:2-5`](../../src/instrumentation.node.ts#L2-L5) — the only configureNeonColdStartMetricSink call, so emitMetric is a no-op in scripts
- [`src/features/industry-planner/read-with-retries.ts:1-31`](../../src/features/industry-planner/read-with-retries.ts#L1-L31) — readWithRetries + abortable pause (abort-before-listen bug, listener leak)
- [`src/data/eve-status/queries.ts:10-11, 35-47`](../../src/data/eve-status/queries.ts#L10-L11) — same retry-over-delays loop with an inline sleep; readServerStatus already swallows throws
- [`src/features/industry-planner/components/use-planner-location-writes.ts:36-44, 75-82`](../../src/features/industry-planner/components/use-planner-location-writes.ts#L36-L44) — two identical buildLocation readWithRetries blocks
- [`src/features/industry-planner/components/use-component-fee-sources.ts:97-104`](../../src/features/industry-planner/components/use-component-fee-sources.ts#L97-L104) — third identical buildLocation block (77-84 is the same shape on costIndicesEndpoint)
- [`src/features/industry-planner/profiles/use-industry-profiles.ts:34-40`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L34-L40) — fourth readWithRetries consumer (returns the whole outcome)
- [`src/composition/map-creation.ts:63-65, 149`](../../src/composition/map-creation.ts#L63-L65) — private delay(), used as the default injected pause
- [`src/features/maps/map-creation-client.ts:10-12, 14-20`](../../src/features/maps/map-creation-client.ts#L10-L12) — private delay() for the minimum-interstitial Promise.all (browser)
- [`src/scripts/map-replay.ts:105-111`](../../src/scripts/map-replay.ts#L105-L111) — private sleep() behind pace()
- [`src/features/industry-planner/components/use-planner-location-writes.test.ts:24-27`](../../src/features/industry-planner/components/use-planner-location-writes.test.ts#L24-L27) — vi.mock('../read-with-retries') with [0,0] delays; same pattern in use-component-fee-sources.test.ts:23-26, use-planner-profile.test.ts:62-65, use-industry-profiles.test.ts:39

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/profiles/queries.ts:58-64`](../../src/features/industry-planner/profiles/queries.ts#L58-L64) — immediate retry (no delay, no log) of one serializable insert on 40001; a generic retryWhile would exist only for this 6-line loop
- [`src/composition/map-creation.ts:67-135`](../../src/composition/map-creation.ts#L67-L135) — deadline- and offset-ladder loops with injected now/pause and per-attempt AbortController; not a delay-schedule retry
- [`src/db/pg-errors.ts:4-13`](../../src/db/pg-errors.ts#L4-L13) — chain walker (cause only, depth 5); differs on purpose from the two Neon walkers; unifying changes classification
- [`src/lib/neon-cold-start-retry.ts:43-56, 72-91`](../../src/lib/neon-cold-start-retry.ts#L43-L56) — hasTimeoutAbort does a breadth-first search over cause and sourceError; isNeonColdStartError follows a linear cause ?? sourceError; different semantics, keep both

</details>

**Home.** `src/lib/retry.ts (new: sleep, readWithRetries); src/lib/neon-cold-start-retry.ts (existing: options on withColdStartRetry); src/features/industry-planner/build-location-read.ts (feature-local readBuildLocation)`

**Boundary check.** src/lib/retry.ts is in zone lib, whose rule allows only config; it imports nothing. Every consumer may import lib: features (features rule allows lib), data/eve-status (data rule allows lib), composition/map-creation (composition rule allows lib), scripts/map-replay and scripts/warm-neon-query (scripts rule allows lib), and lib/neon-cold-start-retry (same zone). The module must stay universal, with no 'server-only', because map-creation-client and the planner hooks run in the browser. build-location-read.ts is in features/industry-planner and imports transport/api-client (features rule allows transport), lib/retry (allows lib), and its own api-contract.

**API sketch.**

```ts
// src/lib/retry.ts
export function sleep(ms: number, signal?: AbortSignal): Promise<void>; // resolves (never rejects) after ms, at once if signal.aborted, or on abort; removes its listener when the timer fires
export async function readWithRetries<T>(read: () => Promise<T | null>, signal?: AbortSignal, delays: readonly number[] = [600, 1800]): Promise<T | null>; // moved unchanged

// src/lib/neon-cold-start-retry.ts
export interface ColdStartRetryOptions { label?: string /* default 'neon-cold-start-retry' */; retryTimeouts?: boolean /* also retry hasTimeoutAbort errors */ }
export async function withColdStartRetry<T>(read: () => Promise<T>, options?: ColdStartRetryOptions): Promise<T>;

// src/features/industry-planner/build-location-read.ts
export function readBuildLocation(systemId: number, blueprintId: number, signal: AbortSignal): Promise<BuildLocationData | null>;
```

**Migration steps.**

1. Create src/lib/retry.ts with sleep(ms, signal?) and move readWithRetries into it, built on sleep. Fix the pause: return at once when signal.aborted, and remove the abort listener when the timer fires. Move src/features/industry-planner/read-with-retries.test.ts to src/lib/retry.test.ts and add sleep cases.
2. Point the planner importers (use-planner-location-writes.ts, use-component-fee-sources.ts, profiles/use-industry-profiles.ts) at '@/lib/retry'. Change the vi.mock('../read-with-retries') paths in use-planner-location-writes.test.ts, use-component-fee-sources.test.ts, use-planner-profile.test.ts and use-industry-profiles.test.ts to '@/lib/retry'. Delete src/features/industry-planner/read-with-retries.ts.
3. Add src/features/industry-planner/build-location-read.ts: readBuildLocation(systemId, blueprintId, signal) = readWithRetries(async () => { const res = await apiFetch(buildLocationEndpoint, { body: { systemId, blueprintId }, cache: 'no-store', signal }); return res.ok ? res.data : null; }, signal). Use it at use-planner-location-writes.ts 36-44 and 75-82 and at use-component-fee-sources.ts 97-104. Leave the costIndices block alone.
4. In src/data/eve-status/queries.ts, replace lines 38-44 with `const status = (await readWithRetries(readServerStatus, undefined, STATUS_RETRY_DELAYS_MS)) ?? { state: 'unknown' };`. Keep cacheLife selection unchanged.
5. In src/lib/neon-cold-start-retry.ts, make pauseBeforeRetry call sleep. Give withColdStartRetry an optional ColdStartRetryOptions: the predicate becomes isNeonColdStartError(err) || (options.retryTimeouts === true && hasTimeoutAbort(err)), and label is passed to pauseBeforeRetry. Leave the default label, constants, warn text and metric payloads byte-identical.
6. Rewrite src/scripts/warm-neon-query.ts as `await withColdStartRetry(read, { label: 'warm-neon', retryTimeouts: true })`. Then un-export pauseBeforeRetry and hasTimeoutAbort, since Fallow's unused-exports rule flags them once nothing else uses them.
7. Replace the private delay() in src/composition/map-creation.ts (63-65; default at 149) and src/features/maps/map-creation-client.ts (10-12), and sleep() in src/scripts/map-replay.ts (105-107), with the imported sleep.

**Tests.** Move read-with-retries.test.ts to src/lib/retry.test.ts unchanged. Add sleep tests: resolves after ms under fake timers; resolves early on abort; resolves at once when already aborted; no listener left after the timer fires. Add a readWithRetries regression: an abort during a read returns null without waiting out the delay. Extend src/lib/neon-cold-start-retry.test.ts: options.retryTimeouts retries a TimeoutError wrap, the default still fails fast (existing test at 118-129), and options.label appears in the warn line. Existing guards: src/scripts/warm-neon-query.test.ts (timeout and cold-start retry, exhaustion after 4 attempts) and src/data/eve-status/queries.test.ts (fake-timer retry, 'keeps the status a retry recovers'). The planner hook tests cover readBuildLocation through their apiFetch mocks.

**Notes.** Preserve: (1) the default withColdStartRetry log text '[neon-cold-start-retry] attempt N/4 failed (...); retrying in Xms' and the recovered/exhausted metric payloads. Its tests pin the 500/1000/2000 ms timings and the metric bodies. (2) The rule that a timeout abort fails fast in the default path (vendor-resilience-registry depends on it). (3) Under the options, warm-neon keeps 4 attempts and retries TimeoutError. Its '[warm-neon] recovered after N attempts' line goes away. The per-attempt warn lines remain, nothing in .github or package.json parses that line, and the recovery metric is a no-op in scripts because no sink is configured. (4) sleep must resolve rather than reject on abort, because readWithRetries checks signal.aborted after the pause and returns null. Drift: the feature copy's pause is the buggy one (abort before listen, listener leak). The eve-status loop is semantically correct. readWithRetries's catch-to-null is harmless there because readServerStatus never throws.

<sub>Reported by: area:composition, area:data-services, area:lib-infra, concern:client-hooks, concern:generic-utils, concern:persistence.</sub>

<a id="p126"></a>

## P126: Time dependencies through one performance.now helper and stop ESI double-counting Redis

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** Production about -20 / +14. Tests about +40.
- **Depends on:** —
- **Existing primitive:** `src/lib/dependency-timing.ts:addDependencyTiming`

**Problem.** Every dependency timing is reported through addDependencyTiming, but each site starts and stops its own clock. Neon uses performance.now() (db/index.ts, timed-postgres.ts). Redis (upstash.ts) and ESI (platform/esi/index.ts) use Date.now(), which gives integer milliseconds and is not monotonic. upstash.ts and timed-postgres.ts each implement the thenable check separately. Three sites hand-roll start/try/finally/record, and the copies have drifted. timedReserve does not record a rejected reserve(). The ESI timer brackets all of dispatch(), so scoreboard Redis calls and body capture are counted inside 'esi' as well as under 'redis'. correlation.ts sums both kinds into each capability's telemetry, so the per-dependency totals in the SLI breakdown, including which dependency it reports as slowest, are skewed.

**Verifier revision.** The core finding holds. Three hand-rolled try/finally timers exist (db/index.ts fetchFunction, platform/esi/index.ts, and timed-postgres timedReserve, which the finders missed), the thenable test is written twice, and the clocks have drifted between Date.now() and performance.now(). Verification turned up two bugs that matter more than the duplication. (1) The ESI timer wraps the whole dispatch(), not the HTTP call. That window includes scoreboard Redis work (liveSb.getCachedBody at dispatch.ts:256 and sb.report via safeReport at 103/334-337) and body cloning. Those Redis commands are already timed as 'redis' by the upstash Proxy, so the same time is counted under both 'esi' and 'redis'. A 304-then-refetch loop also counts as one 'esi' call. (2) timedReserve records only when reserve succeeds, while every other site, and its tests, record failures too. Part of the design changes: the proposed `observeSettlement(kind, value, start-hook)` is replaced by a simpler `startDependencyTimer(kind) => stop` callback. Both lazy Postgres and eager Redis can pass that callback as their then-handlers, which keeps one clock in one place.

**Sites (11).**

- [`src/lib/dependency-timing.ts:1-18`](../../src/lib/dependency-timing.ts#L1-L18) — Only the sink (setDependencyTimingSink/addDependencyTiming); no clock or helpers.
- [`src/lib/upstash.ts:44-76`](../../src/lib/upstash.ts#L44-L76) — timeRedisSettlement has an inline thenable check (45-51) and uses Date.now() (53, 66); the Proxy starts the clock before the method call, and pipeline/multi are re-wrapped without recording.
- [`src/db/timed-postgres.ts:9-15`](../../src/db/timed-postgres.ts#L9-L15) — Local isThenable, the second copy of the check.
- [`src/db/timed-postgres.ts:24-47`](../../src/db/timed-postgres.ts#L24-L47) — observeQuery: lazy start on the first then, guarded by the OBSERVED symbol; records through originalThen(record, record) with performance.now().
- [`src/db/timed-postgres.ts:49-58`](../../src/db/timed-postgres.ts#L49-L58) — timedReserve: await, then record. A rejected reserve() is never recorded (drifted copy).
- [`src/db/index.ts:33-46`](../../src/db/index.ts#L33-L46) — neonConfig.fetchFunction: try/finally around fetchWithTimeout using performance.now(). This is the correct model: one record per HTTP request.
- [`src/platform/esi/index.ts:46-51`](../../src/platform/esi/index.ts#L46-L51) — try/finally with Date.now() around the whole dispatch() call.
- [`src/platform/esi/dispatch.ts:314-343`](../../src/platform/esi/dispatch.ts#L314-L343) — dispatch loop. The actual ESI HTTP call is fetchWithTimeout at 323. The window also covers reuseOrRevalidate (242-260; getCachedBody Redis read at 256), captureEtagToStore (279-295; res.clone().text()) and safeReport (called at 333-338).
- [`src/platform/esi/dispatch.ts:101-108`](../../src/platform/esi/dispatch.ts#L101-L108) — safeReport awaits sb.report, a Redis pipeline already timed as 'redis', which is therefore double-counted inside 'esi'.
- [`src/platform/esi/scoreboard/redis.ts:50-61`](../../src/platform/esi/scoreboard/redis.ts#L50-L61) — The scoreboard Redis client is built with createUpstashClient, so its commands go through the redis timing Proxy.
- [`src/transport/correlation.ts:24-38`](../../src/transport/correlation.ts#L24-L38) — The sink adds ms and calls per kind into the correlation scope, so the overlapping windows add up.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/telemetry/cost-metrics.ts:5-15`](../../src/data/telemetry/cost-metrics.ts#L5-L15) — startCostTimer/elapsedCostTimer time usage-cost metrics, not dependencies. They live in the data zone, which lib, db and platform/esi may not import.
- [`src/app/api/capability-route.ts:15-38`](../../src/app/api/capability-route.ts#L15-L38) — Whole-capability duration fed into recordCapabilityOutcome, not a dependency timing. This and esi-refresh-worker processJob form a separate parallel 'correlation scope + duration + outcome' pattern (lead only).
- [`src/composition/sync/esi-refresh-worker.ts:150-170`](../../src/composition/sync/esi-refresh-worker.ts#L150-L170) — Per-job capability duration; same parallel pattern as capability-route, not dependency timing.

</details>

**Home.** `src/lib/dependency-timing.ts (extend the existing primitive)`

**Boundary check.** The home is in the lib zone. Consumers: src/lib/upstash.ts is in lib (same zone, and it already imports this module). src/db/index.ts and src/db/timed-postgres.ts are in db, whose rule is `{ from: 'db', allow: ['lib','config'] }`. src/platform/esi/dispatch.ts and index.ts are in platform/esi, whose rule is `{ from: 'platform/esi', allow: ['lib','config'] }`. The module itself imports nothing, so it satisfies `{ from: 'lib', allow: ['config'] }`. All of these files already import @/lib/dependency-timing.

**API sketch.**

```ts
// src/lib/dependency-timing.ts (additions)
export function isThenable(value: unknown): value is PromiseLike<unknown>;
/** Starts a performance.now() clock; calling the returned stop records elapsed ms for `kind`. Safe to pass as both then-handlers. */
export function startDependencyTimer(kind: DependencyKind): () => void;
/** stop = startDependencyTimer(kind); try { return await work(); } finally { stop(); } */
export function timeDependency<T>(kind: DependencyKind, work: () => Promise<T>): Promise<T>;
```

**Migration steps.**

1. Add isThenable, startDependencyTimer and timeDependency to src/lib/dependency-timing.ts, with unit tests in src/lib/dependency-timing.test.ts. Keep addDependencyTiming exported: correlation and capability tests call it.
2. In src/db/index.ts, set getClient's fetchFunction to `(input, init) => timeDependency('neon', () => fetchWithTimeout(input, init, NEON_HTTP_TIMEOUT_MS))` and drop the addDependencyTiming import.
3. In src/db/timed-postgres.ts, delete the local isThenable (9-15) and import it from lib. In observeQuery's begin(), replace the startedAt/record pair with `const stop = startDependencyTimer('neon'); void originalThen(stop, stop);` and keep the OBSERVED marker and the lazy first-then start unchanged. In timedReserve, use `const reserved = await timeDependency('neon', () => reserve(...args) as Promise<unknown>)`; this now records failed reserves.
4. In src/lib/upstash.ts, rewrite timeRedisSettlement as `if (isThenable(result)) void result.then(stop, stop)`, where `stop = startDependencyTimer('redis')` is taken before `method(...args)` in the Proxy. Keep the `result === target` and pipeline/multi branches unrecorded.
5. In src/platform/esi/dispatch.ts:323, wrap the HTTP call: `const res = await timeDependency('esi', () => fetchWithTimeout(url, { ...init, headers }))`. Then delete the try/finally and the addDependencyTiming import from src/platform/esi/index.ts:46-51, so esiFetch returns `dispatch(...)` directly.
6. Remove addDependencyTiming imports that are now unused, and run pnpm check through test-runner.

**Tests.** New tests in src/lib/dependency-timing.test.ts:
- timeDependency returns the value and records once on resolve.
- timeDependency rethrows and records once on reject.
- The stop from startDependencyTimer records its kind with ms >= 0.
- isThenable is true for a native Promise and a hand-made thenable, and false for null, primitives, and an object whose then is not a function.

Add to src/db/timed-postgres.test.ts: 'records a rejected reserve() and still rejects'.

Add an ESI timing test in src/platform/esi/index.test.ts (none exists today; nothing under src/platform/esi references the sink):
- Exactly one 'esi' record per fetchWithTimeout call.
- The 304 revalidate path that refetches yields two 'esi' records.
- With a scoreboard whose report() is slow, that delay does not appear in the 'esi' ms.

Existing guards that must stay green:
- src/lib/upstash.test.ts 'Redis command timing' (248-307), including pipeline-on-exec.
- src/db/timed-postgres.test.ts: laziness, awaited twice counts once, the transaction envelope is not counted.
- src/db/neon-http-timing.test.ts.
- src/transport/correlation.test.ts.
- src/lib/dependency-timing.test.ts.

**Notes.** Intended behavior changes:
(a) ESI 'calls' becomes one per HTTP attempt, and 'ms' no longer includes scoreboard Redis reads and writes or the clone().text() body capture. This matches Neon HTTP (one per fetch) and Redis (one per command).
(b) A failed postgres reserve() now records, matching every other site and the 'records a failed …' tests.
(c) Redis and ESI move to performance.now(): sub-millisecond precision and monotonic.

Must preserve:
- In timed-postgres, the lazy first-then start and the single settlement observation via originalThen (the patched then must not be reused).
- In the upstash Proxy, the eager start before the call, plus returning the receiver for chainable methods and re-wrapping pipeline/multi without recording.

Which copy is right: db/index.ts (one record per HTTP fetch, performance.now, records on failure). The ESI site and timedReserve are the drifted copies.

Vitest 4 fake timers in esi/index.test.ts do not assert timing values, so the clock switch is safe.

<sub>Reported by: area:lib-infra.</sub>

<a id="p130"></a>

## P130: Retire transport/cron swallow and route log-and-continue side effects through lib bestEffort

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -35 / +30: swallow and its tests removed, ~15 lines of inline try/catch collapsed, a ~25-line best-effort.test.ts added.
- **Depends on:** —
- **Existing primitive:** `src/lib/best-effort.ts:bestEffort`

**Problem.** There are two primitives for 'run a side effect, log its failure, carry on'. lib/best-effort.bestEffort has 11 callers across composition and data. transport/cron.swallow has 3 callers (two cron declarations and the ESI refresh worker), all wrapping Discord alerts, and lives in the cron auth module for no reason. Four more places hand-roll the same void try/await/console.error block: neon-cold-start-retry's emitMetric, both catches in character-authorization, and revokeStoredCharacterToken. Because bestEffort requires a subject, swallow-style call sites with no subject could not adopt it, which is why swallow survived.

**Verifier revision.** The core holds. swallow(label, promise) in src/transport/cron.ts and bestEffort(scope, label, subject, thunk) in src/lib/best-effort.ts do the same job: await, log the failure, continue. swallow's three callers are all ops alerts and have nothing to do with cron transport. Three corrections to the finding. (1) The 'synchronous throw escapes swallow' risk is not live today: alertPriceSourceDegradation, maybeAlertPublicEsiBudgetExhaustion and alertEsiRefreshDeadLetter are all `async function`s, so a throw becomes a rejection. The thunk form is still more robust, for example against a synchronously throwing test mock. (2) Eager start does not matter: each swallow(...) is awaited on the same line it is built, with no work in between. (3) composition importing transport/cron is legal (composition allows transport), so this is a cohesion fix, not a boundary fix. The finders missed two more sites with the same shape: the per-candidate catch in character-authorization.ts:43-48 and revokeStoredCharacterToken in eve-token-service.ts:192-204. If bestEffort's subject becomes nullable, every migrated log line stays byte-identical.

**Sites (11).**

- [`src/lib/best-effort.ts:1-12`](../../src/lib/best-effort.ts#L1-L12) — Canonical primitive. Logs `[scope] label failed for subject`. Callers: composition/board/net-worth-link.ts:13, composition/account-lifecycle/account-merge.ts:132-138, composition/map-access-identity.ts:42-84, data/maps/purge.ts:114-122
- [`src/transport/cron.ts:24-30`](../../src/transport/cron.ts#L24-L30) — swallow(label, p): duplicate primitive in the cron-auth module
- [`src/app/api/cron/refresh-prices/declaration.ts:10, 66-74`](../../src/app/api/cron/refresh-prices/declaration.ts#L10) — swallow('[cron:prices] degradation alert failed', alertPriceSourceDegradation(...))
- [`src/app/api/cron/drain-esi-refresh-jobs/declaration.ts:5, 35-38`](../../src/app/api/cron/drain-esi-refresh-jobs/declaration.ts#L5) — swallow('[cron:esi-refresh-jobs] public ESI budget alert failed', maybeAlertPublicEsiBudgetExhaustion())
- [`src/composition/sync/esi-refresh-worker.ts:31, 108-121`](../../src/composition/sync/esi-refresh-worker.ts#L31) — Composition imports swallow from transport/cron to wrap alertEsiRefreshDeadLetter
- [`src/lib/neon-cold-start-retry.ts:21-28`](../../src/lib/neon-cold-start-retry.ts#L21-L28) — emitMetric: null-sink guard, then an inline try/await/console.error('[neon-cold-start-retry] telemetry write failed')
- [`src/composition/character-authorization.ts:43-48`](../../src/composition/character-authorization.ts#L43-L48) — Missed by the finders: per-candidate catch logging '[character-authorization] check failed' with characterId
- [`src/composition/character-authorization.ts:54-60`](../../src/composition/character-authorization.ts#L54-L60) — cache()-wrapped background check with an inline log-and-drop
- [`src/platform/auth/eve-token-service.ts:192-204`](../../src/platform/auth/eve-token-service.ts#L192-L204) — Missed by the finders: revokeStoredCharacterToken's whole body is try { ... } catch { console.error('[eve-token] revoke failed') }
- [`src/transport/cron.test.ts:115-130`](../../src/transport/cron.test.ts#L115-L130) — swallow's only direct tests
- [`src/lib/alerts.ts:29-107`](../../src/lib/alerts.ts#L29-L107) — All three alert producers are async functions, so the eager-promise sync-throw hazard is latent, not live

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/pipelines/cron-gate.ts:59-69`](../../src/composition/pipelines/cron-gate.ts#L59-L69) — recordUsage wraps logUsageEvent. It belongs to the separate usage-event emitter opportunity, as the finding says.
- [`src/data/telemetry/cost-metrics.ts:17-37`](../../src/data/telemetry/cost-metrics.ts#L17-L37) — Telemetry write paired with after() scheduling. Same emitter family, handled there.
- [`src/data/domain-events/queries.ts:10-27`](../../src/data/domain-events/queries.ts#L10-L27) — Ledger write plus after() scheduling. Same emitter family.
- [`src/platform/auth/same-origin.ts:49-58`](../../src/platform/auth/same-origin.ts#L49-L58) — Fire-and-forget `void promise.catch(...)` that is never awaited, so the semantics differ. Emitter family.
- [`src/composition/esi-health.ts:25-52`](../../src/composition/esi-health.ts#L25-L52) — The catch returns a fallback value ({state:'unknown'}), not void. Different concept.
- [`src/platform/auth/affiliation.ts:10-23`](../../src/platform/auth/affiliation.ts#L10-L23) — The catch returns a degraded outcome object. Not log-and-drop.
- [`src/composition/sync/esi-refresh-worker.ts:280-293`](../../src/composition/sync/esi-refresh-worker.ts#L280-L293) — Structured JSON log with jobId/dataset/failure fields feeding the drain counts. Different log contract.

</details>

**Home.** `src/lib/best-effort.ts (existing primitive)`

**Boundary check.** Home zone: lib. Rule `{from:'lib', allow:['config']}`: best-effort.ts has no imports. Consumers: api (src/app/api/cron/*) allows lib; composition (esi-refresh-worker, character-authorization) allows lib; lib (neon-cold-start-retry) is the same zone; platform/auth (eve-token-service) allows lib. After the change, transport/cron.ts drops an export and nothing new imports transport.

**API sketch.**

```ts
export async function bestEffort(
  scope: string,
  label: string,
  subject: string | null,
  action: () => Promise<unknown>,
): Promise<void>
// logs `[${scope}] ${label} failed${subject === null ? '' : ` for ${subject}`}`, error
```

**Migration steps.**

1. Change bestEffort's subject to `string | null` and build the message as `[${scope}] ${label} failed` + (subject === null ? '' : ` for ${subject}`). The 11 existing callers keep identical output.
2. Add src/lib/best-effort.test.ts covering: resolve path (no log); rejection logged with and without a subject; a synchronously throwing non-async thunk is caught, since action() is called inside the try.
3. refresh-prices/declaration.ts: replace swallow with `await bestEffort('cron:prices', 'degradation alert', null, () => alertPriceSourceDegradation({...}))` and swap the import to '@/lib/best-effort'.
4. drain-esi-refresh-jobs/declaration.ts: `await bestEffort('cron:esi-refresh-jobs', 'public ESI budget alert', null, () => maybeAlertPublicEsiBudgetExhaustion())`. Keep the call before drainEsiRefreshJobs.
5. esi-refresh-worker.ts alertDeadLetter: `await bestEffort('esi-refresh-worker', 'dead-letter alert', `job ${job.id}`, () => alertEsiRefreshDeadLetter({...}))` and remove the '@/transport/cron' import.
6. Delete swallow from src/transport/cron.ts and the `describe('swallow')` block plus the swallow import in src/transport/cron.test.ts. guard-emissions.test.ts lists only requireBearerSecret/requireCronAuth and needs no change.
7. neon-cold-start-retry.ts emitMetric: keep the `if (!metricSink) return;` guard, capture `const sink = metricSink`, then `await bestEffort('neon-cold-start-retry', 'telemetry write', null, async () => sink(metric))`.
8. character-authorization.ts:43-48: inside the worker loop, `await bestEffort('character-authorization', 'check', candidate.characterId, () => getFreshAccessTokenForCharacter(Number(candidate.characterId), { forceRefresh: true }))`. Keep the claim-expiry comment.
9. character-authorization.ts:54-60: `cache((userId) => bestEffort('character-authorization', 'background check', userId, () => checkCharacterAuthorizations(userId)))`.
10. eve-token-service.ts:192-204: wrap the body as `await bestEffort('eve-token', 'revoke', null, async () => { ... })`. The early return for a null token stays inside the thunk, and requireEnv throws are still caught.
11. Run pnpm check through test-runner. Fallow unused-exports will confirm swallow has no remaining importers.

**Tests.** New: src/lib/best-effort.test.ts (absorbs the two swallow cases from src/transport/cron.test.ts:115-130 and adds subject-null formatting and the sync-throw case). Worth adding: refresh-prices/route.test.ts case with alertMock.mockRejectedValue(new Error('discord down')), asserting the run still returns 200 and console.error was called with '[cron:prices] degradation alert failed'. Existing guards: refresh-prices/route.test.ts:138-180 (alert payload), drain-esi-refresh-jobs/route.test.ts:60-118 (alert ordering), composition/sync/esi-refresh-worker.test.ts:250-290 (dead-letter path), lib/neon-cold-start-retry.test.ts:208-217 ('isolates a failing telemetry sink', console.error once), composition/character-authorization.test.ts:111-130, platform/auth/eve-token-service.revoke.test.ts:69-74 (never throws when revoke fails).

**Notes.** Log text is preserved exactly for the prices, budget-alert, neon-metric and eve-token sites when subject is null. The dead-letter alert gains ' for job N'. The character-authorization lines gain ' for <id>' in place of a separate console argument. No test asserts those exact strings; checked with a grep for 'alert failed', 'background check failed' and 'revoke failed'. Keep each alert awaited in its current position: the drain runs the budget alert before claiming jobs, and the prices cron runs it after record('price_source_degraded'). cron-gate.recordUsage, cost-metrics, domain-events and the `void logUsageEvent(...).catch(...)` sites are deliberately left to the usage-event emitter opportunity, so bestEffort does not absorb after()-scheduled or fire-and-forget telemetry here.

<sub>Reported by: concern:generic-utils, concern:request-pipeline.</sub>

<a id="p173"></a>

## P173: Route every ops alert through one private sendOpsAlert in lib/alerts that rejects non-2xx webhooks

- **Status:** [x] done
- **Category:** server-pipeline · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** alerts.ts about -18/+14; alerts.test.ts about +35
- **Depends on:** [P130](#p130)
- **Existing primitive:** `src/lib/alerts.ts:alertPublicEsiBudgetExhaustion`

**Problem.** src/lib/alerts.ts has three Discord senders. Each repeats the webhook-URL guard, the APP_VERSION footer and the ISO timestamp. Only the budget alert checks response.ok and throws on a non-2xx. The price-degradation and dead-letter alerts resolve normally on a rejected webhook. Their callers wrap them in swallow(), which logs only on a rejection, so a rate-limited or revoked Discord webhook drops those alerts with no log line.

**Verifier revision.** The core finding holds. alertPriceSourceDegradation (alerts.ts:29-61) and alertEsiRefreshDeadLetter (63-85) throw away the Response, so a 4xx or 5xx from Discord resolves normally. All three callers wrap the alert in swallow() (transport/cron.ts:24-30), which logs only on a rejection, so those failures are never logged. Only alertPublicEsiBudgetExhaustion (87-107) checks response.ok. Each sender also repeats the DISCORD_ALERT_WEBHOOK_URL guard, the footer and the timestamp. The proposal to inline and delete src/lib/discord.ts is wrong. postDiscordWebhook is the registered vendor wrapper for 'discord-webhooks' (vendor-resilience-registry.ts:175-186). vendor-resilience.test.ts:138-155 requires that module to exist and export that symbol. guard-emissions.test.ts:25-33 also pins 'src/lib/discord.ts:postDiscordWebhook' as a protected Response-returning export. Deleting the file would break two architecture tests and leave no exported vendor wrapper to register. A private sendOpsAlert would not satisfy the registry check, which requires an exported symbol. Revised design: keep discord.ts unchanged and put the shared sender, including the ok check, in alerts.ts.

**Sites (9).**

- [`src/lib/alerts.ts:29-61`](../../src/lib/alerts.ts#L29-L61) — price-degradation alert: URL guard, footer and timestamp; return value of postDiscordWebhook discarded
- [`src/lib/alerts.ts:63-85`](../../src/lib/alerts.ts#L63-L85) — dead-letter alert: same guard, footer and timestamp; response discarded
- [`src/lib/alerts.ts:87-107`](../../src/lib/alerts.ts#L87-L107) — budget alert: same guard, footer and timestamp; checks response.ok and throws. This is the correct copy.
- [`src/lib/discord.ts:4-16`](../../src/lib/discord.ts#L4-L16) — vendor wrapper (fetchWithTimeout plus OUTBOUND_USER_AGENT); returns the raw Response
- [`src/transport/cron.ts:24-30`](../../src/transport/cron.ts#L24-L30) — swallow() logs only on a rejection, so a resolved 4xx or 5xx is invisible
- [`src/app/api/cron/refresh-prices/declaration.ts:66-74`](../../src/app/api/cron/refresh-prices/declaration.ts#L66-L74) — price alert wrapped in swallow()
- [`src/composition/sync/esi-refresh-worker.ts:108-122`](../../src/composition/sync/esi-refresh-worker.ts#L108-L122) — dead-letter alert wrapped in swallow(); missed by the finders
- [`src/app/api/cron/drain-esi-refresh-jobs/public-budget-alert.ts:41-55`](../../src/app/api/cron/drain-esi-refresh-jobs/public-budget-alert.ts#L41-L55) — relies on the budget alert returning false when unconfigured and throwing on non-2xx, so the claim expires
- [`src/app/api/cron/drain-esi-refresh-jobs/declaration.ts:35-38`](../../src/app/api/cron/drain-esi-refresh-jobs/declaration.ts#L35-L38) — budget alert wrapped in swallow()

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/discord.ts:4-16`](../../src/lib/discord.ts#L4-L16) — Not deletable. It is the vendor-resilience wrapper (vendor-resilience-registry.ts:175-186, checked by vendor-resilience.test.ts:138-155) and a pinned protected Response export (guard-emissions.test.ts:25-33).

</details>

**Home.** `src/lib/alerts.ts (a new private sendOpsAlert); src/lib/discord.ts stays as the vendor wrapper`

**Boundary check.** alerts.ts is in the lib zone. It imports @/config/app-version (config) and @/lib/discord and @/lib/env (lib). The rule {from: lib, allow: [config]} permits config, and imports inside the lib zone are always allowed. Consumers are unchanged: the refresh-prices declaration and drain-esi-refresh-jobs/public-budget-alert are in the api zone ({from: api} allows lib), and composition/sync/esi-refresh-worker is in the composition zone ({from: composition} allows lib). No new cross-zone import is added.

**API sketch.**

```ts
type OpsAlertEmbed = { title: string; description: string; fields?: ReadonlyArray<{ name: string; value: string; inline?: boolean }> };
// private: false when DISCORD_ALERT_WEBHOOK_URL is unset; throws Error(`Ops alert webhook returned ${status}`) on !response.ok
async function sendOpsAlert(embed: OpsAlertEmbed): Promise<boolean>;
// public signatures unchanged:
export function isOpsAlertConfigured(): boolean;
export async function alertPriceSourceDegradation(info: PriceSourceDegradation): Promise<void>;
export async function alertEsiRefreshDeadLetter(info: EsiRefreshDeadLetter): Promise<void>;
export async function alertPublicEsiBudgetExhaustion(info: PublicEsiBudgetExhaustion): Promise<boolean>;
```

**Migration steps.**

1. In src/lib/alerts.ts, add a private sendOpsAlert(embed). It reads readEnv('DISCORD_ALERT_WEBHOOK_URL') and returns false if unset. Otherwise it calls postDiscordWebhook(url, { embeds: [{ ...embed, footer: { text: `LGI.tools v${APP_VERSION}` }, timestamp: new Date().toISOString() }] }), throws when !response.ok, and returns true.
2. Make isOpsAlertConfigured and sendOpsAlert share one read of the URL, for example a tiny opsAlertWebhookUrl() helper, so the env name appears once.
3. Rewrite alertPublicEsiBudgetExhaustion to `return sendOpsAlert({...})`. Move its error-message wording into sendOpsAlert. The existing test asserts the message contains 'returned 503', so keep that substring.
4. Rewrite alertPriceSourceDegradation and alertEsiRefreshDeadLetter to build only their embed and `await sendOpsAlert(embed)`. The fallbackPct computation stays in the price alert.
5. Leave src/lib/discord.ts, guard-emissions.test.ts and the registry wrapper unchanged. Update the 'degradation' text in vendor-resilience-registry.ts:183-185 to say that a non-2xx webhook response rejects and the cron caller logs it through swallow().
6. Make no changes in callers. All three already wrap the alert in swallow(), which will now log rejected webhooks.

**Tests.** Extend src/lib/alerts.test.ts, which already mocks @/lib/discord. Add a case where alertPriceSourceDegradation rejects when postDiscordWebhook resolves a 503. Add alertEsiRefreshDeadLetter cases, which are missing today: no post when the URL is unset; posts the embed with Dataset, Attempts, Resource and Failure fields plus the footer; rejects on a 503. Keep 'rejects a non-success response so the alert claim can be released'. Existing guards: alerts.test.ts:43-71 (budget), public-budget-alert.test.ts:154 'leaves a failed delivery as an expiring claim', and refresh-prices route.test.ts and esi-refresh-worker.test.ts, which mock @/lib/alerts and are unaffected. vendor-resilience.test.ts and guard-emissions.test.ts must stay green unchanged.

**Notes.** The budget alert is the correct copy: it checks ok and throws. The other two have drifted. The behavior change is intended: a rejected Discord post from the price or dead-letter alert now produces a console.error through swallow() instead of nothing, and no caller's control flow changes. Keep the budget alert's `false when unconfigured` return, because maybeAlertPublicEsiBudgetExhaustion maps it to 'unconfigured'. The two void alerts can discard the boolean. Do not move the ok check into postDiscordWebhook unless you also update guard-emissions PROTECTED_RESPONSE_EXPORTS, because the wrapper would then stop returning a Response.

<sub>Reported by: area:lib-infra.</sub>

<a id="p128"></a>

## P128: Add one sentence-case identifier humaniser in lib/format and use it for label fallbacks

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** Production about -16 / +14. Tests about +20.
- **Depends on:** —

**Problem.** Four modules turn machine identifiers into display labels in four different ways:
- wormhole-effects humanize splits camelCase on /([a-z])([A-Z])/ and keeps each word's case, giving Title Case.
- page-settings labelFromKey splits on /([a-z0-9])([A-Z])/ and lowercases, giving sentence case.
- ref-types titleCase splits snake_case and capitalises every word.
- preferences-view hand-rolls capitalise-first, and wormhole-effects hand-rolls it twice more.

As a result, fallback labels for unknown CCP journal ref types and for dogma attributes without a displayName come out in Title Case. Their curated neighbours in the same tables are sentence case, and so are the page-settings labels. Digit handling has drifted too: 'level2Bonus' splits in page-settings but not in wormhole-effects.

**Verifier revision.** The concept is real and repeated across four files in four zones, and the casing has drifted in ways users can see. Two fallbacks produce Title Case ('Drone Tracking', 'Some New Ccp Thing') and sit next to curated sentence-case labels in the same lists ('Warp speed', 'Broker fee'). page-settings already produces sentence case. Scope changes:
- Drop admin ops-view: it only turns underscores into lowercase words inside a composite admin title, and an inline replaceAll is clearer there.
- Drop the `case: 'title' | 'sentence'` option: the app's labels are sentence case, so a single policy is enough.
- Home in the existing src/lib/format directory, beside names.ts (initials), rather than in a new directory.

**Sites (11).**

- [`src/data/eve-data/wormhole-effects.ts:131-135`](../../src/data/eve-data/wormhole-effects.ts#L131-L135) — humanize: camel split on [a-z][A-Z], first letter upper, rest unchanged (Title-ish).
- [`src/data/eve-data/wormhole-effects.ts:137-143`](../../src/data/eve-data/wormhole-effects.ts#L137-L143) — effectModifierLabel uses humanize as the fallback and capitalises first again inline at 142.
- [`src/data/eve-data/wormhole-effects.ts:150-172`](../../src/data/eve-data/wormhole-effects.ts#L150-L172) — foldResistances capitalises first inline at 167.
- [`src/data/eve-data/wormhole-effects.test.ts:108-110`](../../src/data/eve-data/wormhole-effects.test.ts#L108-L110) — Asserts 'Drone Tracking' for the fallback alongside 'Warp speed' for the displayName path: the casing drift.
- [`src/platform/page-settings/controls.ts:45-49`](../../src/platform/page-settings/controls.ts#L45-L49) — labelFromKey: last '.' segment, split on [a-z0-9][A-Z], lowercase, capitalise first (sentence case).
- [`src/platform/page-settings/controls.test.ts:60-68`](../../src/platform/page-settings/controls.test.ts#L60-L68) — 'Camera follow', 'Click focus' (sentence case).
- [`src/features/character-sheet/ref-types.ts:1-36`](../../src/features/character-sheet/ref-types.ts#L1-L36) — Curated labels are sentence case ('Broker fee', 'Skill purchase').
- [`src/features/character-sheet/ref-types.ts:38-48`](../../src/features/character-sheet/ref-types.ts#L38-L48) — The titleCase(snake) fallback is Title Case.
- [`src/features/character-sheet/ref-types.test.ts:5-12`](../../src/features/character-sheet/ref-types.test.ts#L5-L12) — The fallback asserts 'Some New Ccp Thing' while curated entries are sentence case.
- [`src/app/(site)/settings/preferences/preferences-view.ts:15-19`](../../src/app/%28site%29/settings/preferences/preferences-view.ts#L15-L19) — titleForSpec capitalises the first letter of the route segment by hand.
- [`src/lib/format/names.ts:1-5`](../../src/lib/format/names.ts#L1-L5) — Existing lib/format text helper (initials); the new module sits beside it.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/ops-view.ts:58-66`](../../src/app/%28site%29/admin/ops-view.ts#L58-L66) — `dataset.replaceAll('_', ' ')` builds lowercase words inside an admin composite title with no capitalisation. A helper adds nothing here.
- [`src/components/type-icon.tsx:44`](../../src/components/type-icon.tsx#L44) — Two-letter monogram, not a label from an identifier.
- [`src/features/maps/AccessListEditor.tsx:167`](../../src/features/maps/AccessListEditor.tsx#L167) — CSS `capitalize` on display text is presentational, not identifier humanising.
- [`src/mapper/authoring/wormhole-type-search.ts:24-54`](../../src/mapper/authoring/wormhole-type-search.ts#L24-L54) — toUpperCase normalises wormhole type codes for matching; a different concept.

</details>

**Home.** `src/lib/format/text.ts (new file next to src/lib/format/names.ts)`

**Boundary check.** The home is in the lib zone and imports nothing, so it satisfies `{ from: 'lib', allow: ['config'] }`. Consumers:
- src/data/eve-data/wormhole-effects.ts: data zone; its rule allows 'lib', and data/eve-data/universe.ts already imports @/lib.
- src/platform/page-settings/controls.ts: platform/page-settings, `allow: ['lib']`; controls.ts already imports @/lib/preferences.
- src/features/character-sheet/ref-types.ts: features; the rule's allow list includes 'lib'.
- src/app/(site)/settings/preferences/preferences-view.ts: app; the rule's allow list includes 'lib'.

**API sketch.**

```ts
// src/lib/format/text.ts
/** First character upper-cased; the rest untouched. '' -> ''. */
export function capitalize(text: string): string;
/** Splits camelCase (incl. digit->Upper and ACRONYMWord boundaries), snake_case and kebab-case into words;
 *  lower-cases words except all-caps acronyms (length >= 2); capitalises the first word.
 *  'droneTrackingBonus' -> 'Drone tracking bonus', 'some_new_ccp_thing' -> 'Some new ccp thing',
 *  'detailMode' -> 'Detail mode', 'maxECMRange' -> 'Max ECM range'. */
export function humanizeIdentifier(id: string): string;
```

**Migration steps.**

1. Add src/lib/format/text.ts with capitalize and humanizeIdentifier, and src/lib/format/text.test.ts (coverage requires every file). Export only these two functions; ignoreExportsUsedInFile is false, so an extra word-splitter export would be flagged as unused.
2. Behavior-preserving sites first. In src/platform/page-settings/controls.ts:45-49, make labelFromKey return `humanizeIdentifier(key.slice(key.lastIndexOf('.') + 1))`; labels stay 'View', 'Detail mode', 'Camera follow'. In src/app/(site)/settings/preferences/preferences-view.ts:18, return `capitalize(segment)`.
3. In src/data/eve-data/wormhole-effects.ts, delete humanize (131-135). The fallback becomes `displayName?.trim() || humanizeIdentifier(name)`. Replace the inline capitalise at 142 with `capitalize(stripped)` and at 167 with `${capitalize(layer)} resistances`. Update wormhole-effects.test.ts:109 to expect 'Drone tracking'.
4. In src/features/character-sheet/ref-types.ts, delete titleCase (38-44) and fall back to `humanizeIdentifier(refType)`. Update ref-types.test.ts:12 to expect 'Some new ccp thing'.
5. Land steps 3 and 4 together, as one commit that names the copy change.

**Tests.** New src/lib/format/text.test.ts cases:
- capitalize: '' and a single character.
- humanizeIdentifier on camelCase, snake_case, kebab-case, a digit boundary ('scan3dView' -> 'Scan3d view'), an acronym ('maxECMRange' -> 'Max ECM range'), an already-spaced string, and ''.

Existing guards:
- src/platform/page-settings/controls.test.ts:30, 65-68 (must stay unchanged).
- src/app/(site)/settings/preferences/preferences-view.test.ts (title 'Demo', route '/empty').
- src/data/eve-data/wormhole-effects.test.ts:108-110 (one expectation updated).
- src/features/character-sheet/ref-types.test.ts:12 (one expectation updated).

**Notes.** Which copy is right: page-settings labelFromKey, with sentence case and digit-aware splitting. It matches the curated sentence-case tables in ref-types (REF_TYPE_LABELS) and the EVE displayName labels in wormhole-effects. The two Title Case fallbacks are the drifted copies, and migrating them is a deliberate user-visible copy change: update the two test expectations. If the owner wants to keep Title Case for fallbacks, keep the helper and those two call sites unchanged rather than adding a case option.

wormhole-effects internals are unaffected: LABEL_OVERRIDES is looked up by raw.toLowerCase(), and TRAILING_DOGMA_WORDS and RESISTANCE_LAYER are both /i.

Acronym preservation is new behavior. No current test covers it, but it avoids 'Max ecmrange'-style output.

<sub>Reported by: concern:formatting.</sub>

<a id="p129"></a>

## P129: Patch search params through one lib helper, and build the post-create link with atlasMapHref

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** Production about -25 / +14. Tests about +25.
- **Depends on:** —

**Problem.** boardViewHref, profileHref, setStructuresPanelOpen, mapSelectionHref and mapDeletionHref, plus the sites deep-link backHref, each copy the search string into URLSearchParams, set or delete keys, and rebuild `pathname[?query][#hash]` by hand. Their serialisation has drifted:
- Only the board strips '=' from empty values. The others rewrite `?demo` as `?demo=`, which is the same value to readers but a different URL.
- Only structures-panel keeps the hash.

Separately, map-creation-client.handoffCreatedMap hand-builds `/atlas?map=` instead of calling atlasMapHref from map-navigation in the same feature.

**Verifier revision.** The repeated idiom is real: copy the current query, set or delete keys, then return pathname plus an optional query. It appears in five functions across components-composition, features/maps and one app page, with small drifts:
- Only boardViewHref writes empty values as bare flags (tested: '?demo' survives).
- Only setStructuresPanelOpen keeps location.hash.

The clearest bypass is handoffCreatedMap rebuilding '/atlas?map=' when atlasMapHref in the same feature returns exactly that ('/atlas?map=map%2Fone' in both tests).

Scope changes from the proposal:
- Drop writeSearchParams. The three history writers differ (pushState with a FOCUSED marker or replaceState in use-focus-view, replaceState in ProfileWorkspace, pushState in structures-panel), and each is one line.
- Exclude buildSortHref. It sits in the ui zone, which may import nothing, and it rebuilds from a record instead of patching.
- Treat use-focus-view and ProfileWorkspace as callers, not sites.
- mapSelectionHref's unconditional '?' is not a bug, because it always sets map.

**Sites (15).**

- [`src/components/composition/board/board-view-model.ts:192-199`](../../src/components/composition/board/board-view-model.ts#L192-L199) — boardViewHref: set or delete ?character; returns pathname when the query is empty; strips '=' before & or end (bare flags).
- [`src/components/composition/board/board-view-model.test.ts:124-129`](../../src/components/composition/board/board-view-model.test.ts#L124-L129) — Pins the '?demo' bare-flag preservation and the empty-query → pathname case.
- [`src/components/composition/board/use-focus-view.ts:25-29`](../../src/components/composition/board/use-focus-view.ts#L25-L29) — Caller: pushState (with a state marker) or replaceState with window.location.pathname/search. The hash is dropped.
- [`src/components/composition/industry-workspace/workspace-model.ts:47-55`](../../src/components/composition/industry-workspace/workspace-model.ts#L47-L55) — profileHref: set or delete profile and always delete character; empty → pathname. No '=' stripping.
- [`src/components/composition/industry-workspace/workspace-model.test.ts:121-122`](../../src/components/composition/industry-workspace/workspace-model.test.ts#L121-L122) — Pins profileHref output.
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:103-106`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L103-L106) — Caller: replaceState(profileHref(pathname, window.location.search, id)). The hash is dropped.
- [`src/components/composition/industry-workspace/structures-panel.ts:16-24`](../../src/components/composition/industry-workspace/structures-panel.ts#L16-L24) — URL object: set or delete panel, pushState with pathname+search+hash. The only copy that keeps the hash.
- [`src/components/composition/industry-workspace/structures-panel.test.ts:15-36`](../../src/components/composition/industry-workspace/structures-panel.test.ts#L15-L36) — Stubs window.location.href only; expects '/industry?profile=p1&panel=structures' and '/industry?profile=p1'.
- [`src/features/maps/map-navigation.ts:7-15`](../../src/features/maps/map-navigation.ts#L7-L15) — mapSelectionHref: set map; '?' is unconditional but always valid because map is set.
- [`src/features/maps/map-navigation.ts:17-23`](../../src/features/maps/map-navigation.ts#L17-L23) — atlasMapHref: the existing canonical '/atlas?map=' builder.
- [`src/features/maps/map-navigation.ts:25-34`](../../src/features/maps/map-navigation.ts#L25-L34) — mapDeletionHref: guard, delete map, empty → '/atlas'.
- [`src/features/maps/map-navigation.test.ts:16-38`](../../src/features/maps/map-navigation.test.ts#L16-L38) — Pins all three map hrefs, including encoding ('map%2Fone').
- [`src/features/maps/map-creation-client.ts:42-51`](../../src/features/maps/map-creation-client.ts#L42-L51) — handoffCreatedMap rebuilds `/atlas?${new URLSearchParams({ map })}` by hand, duplicating atlasMapHref.
- [`src/features/maps/map-creation-client.test.ts:98-114`](../../src/features/maps/map-creation-client.test.ts#L98-L114) — Expects 'navigate:/atlas?map=map%2Fone', identical to atlasMapHref('map/one').
- [`src/app/(site)/sites/[id]/page.tsx:95-98`](../../src/app/%28site%29/sites/[id]/page.tsx#L95-L98) — backHref: picks type and class into a new query; empty → '/sites'. Same idiom, missed by the finders.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/sortable-table-view.ts:18-35`](../../src/components/ui/sortable-table-view.ts#L18-L35) — buildSortHref has the same empty-query idiom, but the ui zone has `allow: []` and cannot import lib. It also rebuilds from a record of current params. Leave it.
- [`src/components/ui/url-sync.tsx:19-37`](../../src/components/ui/url-sync.tsx#L19-L37) — Rewrites the path or hash with an entity id and copies search verbatim; not a param patch, and in the ui zone.
- [`src/components/eve-image.tsx:33`](../../src/components/eve-image.tsx#L33) — Sets ?size on an absolute image-CDN URL; not a page href.
- [`src/composition/esi-character-search.ts:20`](../../src/composition/esi-character-search.ts#L20) — Builds a fresh ESI API query string; not a page-state patch.
- [`src/transport/endpoint.ts:178`](../../src/transport/endpoint.ts#L178) — Endpoint URL query encoding for typed API contracts; a different concept, and it already has its own primitive.

</details>

**Home.** `src/lib/search-params.ts (new, pure, client-safe; no 'server-only')`

**Boundary check.** The home is in the lib zone and imports nothing, so it satisfies `{ from: 'lib', allow: ['config'] }`. Consumers:
- board-view-model.ts and the industry-workspace files: components-composition, whose allow list includes 'lib' (structures-panel.ts already imports @/lib/client-store).
- map-navigation.ts: features, whose allow list includes 'lib'.
- src/app/(site)/sites/[id]/page.tsx: app, whose allow list includes 'lib'.

ui (buildSortHref) is excluded because `{ from: 'ui', allow: [] }`.

**API sketch.**

```ts
// src/lib/search-params.ts
export type SearchPatch = Readonly<Record<string, string | null | undefined>>;
/** Copies `search` (leading '?' ok, or anything with toString like ReadonlyURLSearchParams), applies the patch
 *  (string = set, null/undefined = delete), serialises empty values as bare keys, and returns
 *  `pathname` + (`?query` only when non-empty) + `hash` (pass location.hash to keep it; default ''). */
export function withSearchParams(
  pathname: string,
  search: string | { toString(): string },
  patch: SearchPatch,
  hash?: string,
): string;
```

**Migration steps.**

1. Independent and first: in src/features/maps/map-creation-client.ts:49-50, replace the hand-built query with `actions.navigate(atlasMapHref(mapId))`, importing from './map-navigation'. The map-creation-client test stays unchanged.
2. Add src/lib/search-params.ts (withSearchParams) and src/lib/search-params.test.ts.
3. boardViewHref → `withSearchParams(pathname, search, { [CHARACTER_PARAM]: view.view === 'character' ? String(view.characterId) : null })`. Delete the regex; the helper now does bare-flag serialisation.
4. profileHref → `withSearchParams(pathname, search, { profile: profileId, character: null })`.
5. setStructuresPanelOpen: keep `const url = new URL(window.location.href)` so the test stub still works, then `window.history.pushState(null, '', withSearchParams(url.pathname, url.search, { panel: open ? 'structures' : null }, url.hash))`.
6. mapSelectionHref → `withSearchParams(pathname, searchParams, { map: mapId })`. mapDeletionHref keeps its guard and returns `withSearchParams('/atlas', searchParams, { map: null })`.
7. Optionally, sites/[id]/page.tsx backHref → `withSearchParams('/sites', '', { type: typeof sp.type === 'string' ? sp.type : null, class: typeof sp.class === 'string' ? sp.class : null })`.
8. Do not add a history-writing helper. use-focus-view and ProfileWorkspace keep their own push/replace calls.

**Tests.** New src/lib/search-params.test.ts cases:
- set, delete, and both in one patch.
- Empty result returns the bare pathname.
- A leading '?' and a ReadonlyURLSearchParams-like input are accepted.
- Bare flags: '?demo&character=7' with { character: null } gives '/?demo'.
- Values are percent-encoded ('map/one' → 'map%2Fone').
- The hash is appended only when passed.

Existing tests to keep green unchanged:
- board-view-model.test.ts:124-129
- workspace-model.test.ts:121-122
- structures-panel.test.ts:31-36
- map-navigation.test.ts:16-38
- map-creation-client.test.ts:98-114

**Notes.** Drift resolutions:
(1) Bare-flag serialisation becomes the default for every site. It is lossless: URLSearchParams parses 'k' and 'k=' identically, and values are percent-encoded, so the only '=' left in the string is a separator. The board behavior is the one to keep.
(2) Hash: the default '' preserves today's output for board, profile and maps. structures-panel keeps passing url.hash. No anchors are currently used on the board or industry pages, so passing window.location.hash from use-focus-view and ProfileWorkspace is optional, not a fix.
(3) profileHref clearing 'character' is intentional (documented 'no member focused') and becomes an explicit two-key patch.
(4) mapSelectionHref's always-'?' output is correct because map is always set.

handoffCreatedMap → atlasMapHref gives byte-identical output for any non-empty mapId, and a created map id is never empty.

<sub>Reported by: concern:client-hooks.</sub>

<a id="p047"></a>

## P047: Add a shared useNow clock hook in src/lib for the four interval tickers

- **Status:** [x] done
- **Category:** react-hook · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 lines across four sites and +15 for the hook plus about 40 of tests; removes fallow near-dup groups -1801 and -1101
- **Depends on:** —
- **Existing primitive:** `src/lib/use-hydrating.ts (sibling hook home)`

**Problem.** Four hooks implement the same ticking clock: useState(() => Date.now()) plus an effect that runs setInterval(() => setNow(Date.now()), ms) and clears it on cleanup. They differ in period (30s and 60s), gating (always on, gated on a boolean, gated on a predicate of the clock's own value) and timer API (global or window). MapAuthoringOverlay's copy is seeded from a prop that can be stale.

**Verifier revision.** Four hand-rolled useState(Date.now) + setInterval clocks are confirmed, and fallow groups three of them (dup:c77b3abb6f87acd9-1801 and -1101). A small useNow in src/lib with boolean or predicate gating covers all four with today's semantics, so the core holds. Two parts are cut. (1) 'Run one 60s clock per map' is rejected. Three 60s intervals cost nothing. Hoisting one clock to ChainLive and passing it down would re-render the whole chain subtree (ReactFlow, SignatureProvider) every minute, instead of only the overlay and the signature consumers as today, which is an efficiency regression. Moving the overlay onto the signature clock would require ungating that clock and re-rendering every signature-context consumer each minute. MapAuthoringOverlay keeps its own ungated clock and its Math.max. (2) MarketScorePanel is excluded. It is a single mount-only, non-ticking, hydration-safe null seed with no second consumer, so a useMountedNow export would violate the 'real second consumer' rule. I also found one drift bug: MapAuthoringOverlay seeds its clock with connectionPresentationNow rather than Date.now(). That value freezes at chain mount while no connection is dying, so when the overlay mounts later (access false→true) event-log ages are computed from a stale clock for up to 60s.

**Sites (6).**

- [`src/components/use-live-dataset.ts:10, 108-112`](../../src/components/use-live-dataset.ts#L10) — TICK_MS=30_000, always on, global setInterval; `now` feeds LiveDatasetState.now
- [`src/mapper/signatures/use-signature-panel.ts:9-19, 46`](../../src/mapper/signatures/use-signature-panel.ts#L9-L19) — useSignatureClock(active), 60s, window.setInterval; active = rows.length>0 \|\| panelTarget!==null (SignatureProvider.tsx:84-86)
- [`src/mapper/authoring/MapAuthoringOverlay.tsx:9, 24-32`](../../src/mapper/authoring/MapAuthoringOverlay.tsx#L9) — always-on 60s clock seeded from connectionPresentationNow (stale seed); Math.max with the prop
- [`src/mapper/chain/use-map-chain-pages.ts:23, 126-146`](../../src/mapper/chain/use-map-chain-pages.ts#L23) — TOMBSTONE_TICK_MS=60_000; gate hasDyingConnection is derived from the clock value via chainTombstoneState(row, now)
- [`src/mapper/chain/ChainLive.tsx:102, 173-178`](../../src/mapper/chain/ChainLive.tsx#L102) — the overlay mounts only after the access!==false early return, so it can mount long after use-map-chain seeded connectionPresentationNow
- [`src/data/maps/chain-contract.ts:67-78`](../../src/data/maps/chain-contract.ts#L67-L78) — 'dying' = tombstoned && purgeAfter > now, so the predicate gate turns on correctly even from a stale now

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/MarketScorePanel.tsx:15-19`](../../src/features/industry-planner/components/MarketScorePanel.tsx#L15-L19) — mount-only, non-ticking, null on server via setTimeout(0); one consumer, different semantics
- [`src/mapper/tracking/AfkGate.tsx:33-51`](../../src/mapper/tracking/AfkGate.tsx#L33-L51) — interval drives a state machine (onAfkTick) rather than exposing a clock
- [`src/data/convex/use-sync-subject.ts:35-38`](../../src/data/convex/use-sync-subject.ts#L35-L38) — heartbeat interval injected into a session, not a render clock
- [`src/mapper/tracking/JumpDoorbellObserver.tsx:89`](../../src/mapper/tracking/JumpDoorbellObserver.tsx#L89) — retry interval, not a clock

</details>

**Home.** `src/lib/use-now.ts (sibling of the lib hooks use-hydrating.ts, use-client-committed.ts and use-stable-value.ts)`

**Boundary check.** Home zone lib; the rule {from:'lib', allow:['config']} holds because the hook imports only react. Consumers: use-live-dataset.ts is in components ('src/components/*.ts'), whose rule allows 'lib'. use-signature-panel.ts, MapAuthoringOverlay.tsx and use-map-chain-pages.ts are in mapper, whose rule allows 'lib'. No ui consumer exists, so lib is legal.

**API sketch.**

```ts
export function useNow(
  intervalMs: number,
  active: boolean | ((now: number) => boolean) = true,
): number;
// const [now, setNow] = useState(() => Date.now());
// const on = typeof active === 'function' ? active(now) : active;
// useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [on, intervalMs]);
// return now;
```

**Migration steps.**

1. Add src/lib/use-now.ts and src/lib/use-now.test.ts. Use the global setInterval and clearInterval, not window., so the hook runs under Node tests too.
2. use-live-dataset.ts:108-112 → `const now = useNow(TICK_MS);`. Keep it at the same position in the hook so use-live-dataset.test.ts's call-order useState mock (comment at line 70: 'failed, attempts, now') still lines up.
3. use-signature-panel.ts:9-19 → delete useSignatureClock; `const now = useNow(SIGNATURE_AGE_TICK_MS, clockActive);`.
4. use-map-chain-pages.ts:126-146 → `return useNow(TOMBSTONE_TICK_MS, (now) => connections.rows.some((row) => chainTombstoneState(row, now) === 'dying'));`.
5. MapAuthoringOverlay.tsx:24-32 → `const now = Math.max(useNow(OVERLAY_TICK_MS), connectionPresentationNow);`. This fixes the stale seed, since the hook seeds with Date.now(), and keeps the Math.max so a fresher tombstone tick still wins.
6. Leave MarketScorePanel unchanged.

**Tests.** New src/lib/use-now.test.ts, mocking react the way src/components/use-live-dataset.test.ts:14-37 does (synchronous useEffect with captured cleanup, indexed useState) and using vi.useFakeTimers. Cases: an always-on clock advances after intervalMs; active=false starts no interval; the predicate is called with the current value and toggles the interval; cleanup clears the interval. Existing guards: use-live-dataset.test.ts (state order) and MapAuthoringOverlay.test.ts (static markup; effects do not run). There are no tests for use-signature-panel or use-map-chain-pages clocks today.

**Notes.** Semantics to preserve. (1) Gated clocks keep their last value while off, and when re-activated the next refresh comes intervalMs later. useSignatureClock and useConnectionPresentationNow both behave this way today, so signature ages can lag by up to 60s right after the first rows arrive. An optional follow-up is a setTimeout(0) refresh on re-activation (the lint-safe pattern MarketScorePanel already uses), but it is not needed for parity. (2) Keep the render-time Date.now() seed and the number return type. Changing to number | null (F343) would ripple into LiveDatasetState.now, jobProgress and the first paint of progress bars. (3) The predicate runs on every render of useConnectionPresentationNow, as hasDyingConnection does today: O(rows), no new cost.

<sub>Reported by: area:mapper-chain, area:mapper-signatures, area:ui-components, concern:client-hooks.</sub>

<a id="p226"></a>

## P226: Extract safe web-storage helpers and a stored MRU list into src/lib/web-storage.ts (fixes the unguarded setItem in search recents)

- **Status:** [x] done
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -110 lines across the two stores, preferences, use-search-recents and the doorbell observer; +60 in lib/web-storage.ts (plus its test). Net about -50 production lines.
- **Depends on:** —
- **Existing primitive:** `src/lib/client-store.ts:createClientStore,useClientStore`

**Problem.** Two features each hand-roll a localStorage-backed MRU store for useSyncExternalStore. Three modules plus one inline site re-implement 'return localStorage or sessionStorage, or null when unavailable'. The copies have drifted. recent-blueprints guards setItem and emits only on success, and it copies the listener set before notifying. search-recents writes without a guard (storage.ts:90) and iterates the live Set. Because GlobalSearch.fireResult calls pushRecent before router.push, a storage quota or SecurityError on that write aborts the navigation the user just chose.

**Verifier revision.** The core holds up. search-recents/storage.ts and industry-planner/recent-blueprints.ts build the same device-local MRU store: a module listener Set, a snapshot cached on the raw string, schema-validated array parsing, prepend with dedupe and a cap, then emit. safeStorage() is written three times (preferences.ts:143-150, storage.ts:29-36, recent-blueprints.ts:23-29) and once more inline in JumpDoorbellObserver.tsx:47. The bug is real. storage.ts:90 calls store.setItem with no guard, and GlobalSearch.fireResult (75-86) calls pushRecent at line 77, before setValue, onActiveChange and router.push (85). A QuotaExceededError or SecurityError there leaves the click handler before navigation. I narrowed the scope. favorite-blueprints is a toggle over a server-reconciled preference, not a localStorage MRU. TelemetryReporter and signed-in-hint already guard their own string flags, and adopting a helper would not remove their try/catch. SignedInFold's inline script cannot import anything. Preferences should take only the accessor and the guarded JSON read/write, not a store, because PreferencesProvider already owns the store. A separate mruPush in lib/array.ts has no second consumer, so it stays inside the list store.

**Sites (12).**

- [`src/features/search-recents/storage.ts:9-11, 29-36`](../../src/features/search-recents/storage.ts#L9-L11) — module listener Set and raw-string cache; second safeStorage()
- [`src/features/search-recents/storage.ts:70-92`](../../src/features/search-recents/storage.ts#L70-L92) — pushRecent: prepend, dedupe by id, cap 10; setItem at 90 has no guard, then emit
- [`src/features/search-recents/storage.ts:94-136`](../../src/features/search-recents/storage.ts#L94-L136) — subscribe/snapshot/server snapshot/emit (iterates the live Set)/readStored with filter(isStoredRecent).filter(rendersIcon)
- [`src/features/search-recents/use-search-recents.ts:11-17`](../../src/features/search-recents/use-search-recents.ts#L11-L17) — exists only to wire useSyncExternalStore
- [`src/features/industry-planner/recent-blueprints.ts:18-56`](../../src/features/industry-planner/recent-blueprints.ts#L18-L56) — same store machinery; storage() at 23-29; parse keeps safeParse().data and caps at 8
- [`src/features/industry-planner/recent-blueprints.ts:58-76`](../../src/features/industry-planner/recent-blueprints.ts#L58-L76) — server snapshot null; recordRecentBlueprint guards setItem (70-74) and emits only on success over a copied listener set
- [`src/components/composition/GlobalSearch.tsx:75-86`](../../src/components/composition/GlobalSearch.tsx#L75-L86) — pushRecent (77) runs before setValue, blur and router.push (85), so a throw blocks navigation
- [`src/lib/preferences.ts:123-132, 143-172`](../../src/lib/preferences.ts#L123-L132) — third safeStorage(); guarded removeItem in prune; peekLocalPreference does JSON plus schema safeParse; writeLocalPreference has a guarded setItem
- [`src/mapper/tracking/JumpDoorbellObserver.tsx:46-52`](../../src/mapper/tracking/JumpDoorbellObserver.tsx#L46-L52) — inline `try { storage = window.sessionStorage } catch {}` accessor
- [`src/lib/client-store.ts:23-45`](../../src/lib/client-store.ts#L23-L45) — existing ClientStore contract; useClientStore reads any {get, subscribe, serverValue}
- [`src/features/industry-planner/recent-blueprints.test.ts:67-80`](../../src/features/industry-planner/recent-blueprints.test.ts#L67-L80) — guards the quota-throw and blocked-getter cases for blueprints; search-recents has no equivalent test
- [`src/features/search-recents/storage.test.ts:1-44`](../../src/features/search-recents/storage.test.ts#L1-L44) — window shim; imports subscribeRecents/getRecentsSnapshot/getRecentsServerSnapshot, which the migration replaces

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/favorite-blueprints.ts:19-28`](../../src/features/industry-planner/favorite-blueprints.ts#L19-L28) — A toggle (remove if present, else prepend and cap) over usePreference, which is server-reconciled through PreferencesProvider. It is not a device-local MRU and has no storage code.
- [`src/components/composition/TelemetryReporter.tsx:26-49`](../../src/components/composition/TelemetryReporter.tsx#L26-L49) — Already-guarded get-or-create string flags in local and session storage. The try/catch around getItem/setItem would stay, so a helper saves nothing.
- [`src/platform/auth/signed-in-hint.ts:8-14`](../../src/platform/auth/signed-in-hint.ts#L8-L14) — Single guarded string write/remove. Adopting safeStorage does not shorten it.
- [`src/components/composition/SignedInFold.tsx:41-46`](../../src/components/composition/SignedInFold.tsx#L41-L46) — Pre-hydration inline script string; it cannot import a module.
- [`src/mapper/tracking/doorbell-model.ts:210-235`](../../src/mapper/tracking/doorbell-model.ts#L210-L235) — Guarded JSON read/write against an injected storage with its own map format. Keep the injection for tests; only the accessor in JumpDoorbellObserver adopts the helper.

</details>

**Home.** `src/lib/web-storage.ts (new), next to src/lib/client-store.ts`

**Boundary check.** The home is in the lib zone, whose rule is { from: 'lib', allow: ['config'] }. It imports only zod (a package) and '@/lib/client-store' (same zone). Consumers: features/search-recents and features/industry-planner, legal under the 'features' rule (allows 'lib'); src/lib/preferences.ts, same zone; src/mapper/tracking/JumpDoorbellObserver.tsx, legal under the 'mapper' rule (allows 'lib'). GlobalSearch (components-composition) keeps importing the feature, which its rule allows.

**API sketch.**

```ts
export type StorageKind = 'local' | 'session';
export function safeStorage(kind: StorageKind = 'local'): Storage | null; // typeof window guard + try; never cached
export function readStoredJson<T>(key: string, schema: z.ZodType<T>, kind?: StorageKind): T | undefined;
export function writeStoredJson(key: string, value: unknown, kind?: StorageKind): boolean; // always guarded
export interface StoredList<S, V> extends Pick<ClientStore<V>, 'get' | 'subscribe' | 'serverValue'> { push(entry: S): void }
export function createStoredList<S, V>(opts: {
  key: string; max: number; item: z.ZodType<S>;
  sameEntry: (a: S, b: S) => boolean;
  keep?: (entry: S) => boolean;            // search-recents: rendersIcon
  project: (entries: S[]) => V;            // identity for blueprints; SearchResult mapping for recents
  serverValue: V;                          // null for blueprints, EMPTY for recents
}): StoredList<S, V>; // get() caches on the raw string; push = [entry, ...stored.filter(!sameEntry)].slice(0, max) -> guarded write -> emit over [...listeners] only on success
```

**Migration steps.**

1. Add src/lib/web-storage.ts with safeStorage, readStoredJson and writeStoredJson, plus src/lib/web-storage.test.ts. The coverage-gaps rule requires a test for every file.
2. In src/lib/preferences.ts, delete the private safeStorage (143-150). Make peekLocalPreference return readStoredJson(LS_PREFIX + def.key, def.schema), make writeLocalPreference call writeStoredJson, and have pruneRetiredPreferences call safeStorage(). preferences.test.ts must stay green.
3. Add createStoredList to web-storage.ts with its own tests: dedupe, cap, raw-string snapshot identity, server value, a throwing setItem that neither throws nor emits, and a throwing localStorage getter.
4. Migrate recent-blueprints.ts. Use `const store = createStoredList({ key: STORAGE_KEY, max: MAX_RECENT, item: recentBlueprintSchema, sameEntry: (a, b) => a.typeId === b.typeId, project: (e) => e, serverValue: null as RecentBlueprint[] | null })`, `useRecentBlueprints = () => useClientStore(store)` and `recordRecentBlueprint = (e) => store.push(e)`. Delete lines 18-56. Exported names stay the same for BlueprintShelves and RecordRecentBlueprint.
5. Migrate search-recents/storage.ts. The store holds StoredRecent with item: storedRecentSchema, keep: rendersIcon, sameEntry by id, max 10, project mapping each entry to SearchResult (kind 'recent', originKind, reconstructed icon) and serverValue EMPTY_RECENTS. pushRecent keeps its 'recent'/disabled guards and maps SearchResult to StoredRecent before store.push. Delete safeStorage, listeners, cachedRaw/cachedSnapshot, subscribeRecents, getRecentsSnapshot, getRecentsServerSnapshot, emitRecents, readStored and isStoredRecent.
6. Make use-search-recents.ts `return useClientStore(searchRecentsStore)`, or delete it and export useSearchRecents from storage.ts, then update the GlobalSearch import. Update storage.test.ts to drive the hook or store instead of the deleted functions.
7. Add the regression test to search-recents/storage.test.ts: when setItem throws a QuotaExceededError DOMException, pushRecent does not throw and does not notify.
8. In JumpDoorbellObserver.tsx, replace lines 46-47 with `const storage = safeStorage('session');`.
9. Optional, and a deliberate behavior addition: inside createStoredList.subscribe, attach a single window 'storage' listener (e.key === key || e.key === null) for the first subscriber and remove it after the last, so recents update across tabs. Test it with a dispatched StorageEvent.

**Tests.** New: src/lib/web-storage.test.ts covering safeStorage (no window; a throwing getter; local vs session; no caching between stubs), readStoredJson (missing, bad JSON, schema miss), writeStoredJson (returns false on throw), and createStoredList (prepend, dedupe, cap, raw-cache identity, keep filter, project, serverValue, guarded write without emit, unsubscribe). New regression case in src/features/search-recents/storage.test.ts for a throwing setItem. Existing guards: src/features/industry-planner/recent-blueprints.test.ts (hydration null, ordering and cap of 8, malformed rows, identity, listener, quota and blocked storage); src/features/search-recents/storage.test.ts (projection, blueprint icon reconstruction, stale-row drop, ordering); src/lib/preferences.test.ts; src/lib/client-store.test.ts.

**Notes.** Preserve: storage keys 'lgi:search:recents', 'lgi:industry:recent-blueprints' and 'lgi:pref:*'. Server values: recent blueprints hydrate as null, because BlueprintShelves treats null as unread; search recents as []. Caps are 8 and 10. Dedupe keys are typeId and id. search-recents applies rendersIcon before slicing and projects to SearchResult (kind 'recent', originKind, icon rebuilt from the 'blueprint:<id>' stable id, which is never stored). Correct copy for drifted details: recent-blueprints, which guards the write, emits only on success and notifies over a copied listener set, as createClientStore does. Parsing: recent-blueprints keeps safeParse().data, which strips unknown keys. search-recents keeps the raw object (filter(isStoredRecent)), so a legacy key such as an old stored `icon` can leak through `...r` into a non-blueprint row. Adopt the stripping form. safeStorage must not memoize, because recent-blueprints.test.ts swaps window mid-test. Use the typeof-window guard before the try, as preferences and search-recents do; recent-blueprints puts it inside the try, which is equivalent. The `storage` event listener is new behavior and optional; neither store listens today.

<sub>Reported by: area:features-sites-misc, area:industry-planner, area:lib-infra, area:mapper-chain, concern:client-hooks, concern:generic-utils, dupes-triage-1.</sub>

<a id="p115"></a>

## P115: Extract the BroadcastChannel peer-link lifecycle into src/lib/peer-channel.ts

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** Production: about -45 across the two sites, +35 for the primitive. Tests: about -45 (one fake deleted), +50 for the new primitive test.
- **Depends on:** —

**Problem.** joinDoorbellChannel (mapper) and joinHeartbeatSession (data) each re-implement the same cross-tab channel lifecycle: open the channel by a JSON-stringified key, tear it down on messageerror or on a failed post, null the handlers and swallow close() errors on disconnect, and gate onmessage on being connected. Each also declares the port type separately (DoorbellChannel and an inline type in startHeartbeatSession), and each test file carries its own copy of the TestChannel and TestBus fakes.

**Verifier revision.** The BroadcastChannel lifecycle plumbing really is duplicated, with the same semantics, across two zones. Both sites declare the same port type (Pick<BroadcastChannel,'postMessage'|'close'> plus handlers), share a disconnect that nulls the handlers and try-closes, disconnect when a post throws, open inside try/catch with onmessageerror = disconnect, and name the channel JSON.stringify([prefix, userId, ...]). The test fakes (TestChannel and TestBus) are copied too. The rest of the proposal does not survive. The validators are not duplicates: they check different shapes (doorbell memory snapshots versus heartbeat presence). Converting them to zod is a style rewrite whose exact semantics are awkward in zod: the snapshot drops invalid entries one at a time, an invalid lease demotes inFlight to false, requestSnapshot must be exactly true, and keys must be positive safe integers. Moving parse and the tabId self-filter into the primitive would also change the unit-tested createHeartbeatPeers.receive API and gain nothing, because the doorbell needs an extra mapId filter anyway. The primitive is therefore transport lifecycle only.

**Sites (13).**

- [`src/mapper/tracking/doorbell-model.ts:17-21`](../../src/mapper/tracking/doorbell-model.ts#L17-L21) — DOORBELL_CHANNEL_PREFIX and doorbellChannelName = JSON.stringify([prefix, userId])
- [`src/mapper/tracking/doorbell-model.ts:316-319`](../../src/mapper/tracking/doorbell-model.ts#L316-L319) — exported DoorbellChannel port type
- [`src/mapper/tracking/doorbell-model.ts:333-366`](../../src/mapper/tracking/doorbell-model.ts#L333-L366) — channel var, disconnect (which also calls finishJoin), open in try/catch, onmessage gate on channel !== null, onmessageerror = disconnect
- [`src/mapper/tracking/doorbell-model.ts:367-379`](../../src/mapper/tracking/doorbell-model.ts#L367-L379) — share(): postMessage in try/catch that disconnects on throw
- [`src/data/convex/heartbeat-session.ts:7, 12, 15-25`](../../src/data/convex/heartbeat-session.ts#L7) — Channel alias, channel var, and disconnect identical to the doorbell's (minus finishJoin)
- [`src/data/convex/heartbeat-session.ts:27-35`](../../src/data/convex/heartbeat-session.ts#L27-L35) — advertise(): channel?.postMessage in try/catch that disconnects on throw
- [`src/data/convex/heartbeat-session.ts:48-60`](../../src/data/convex/heartbeat-session.ts#L48-L60) — open JSON.stringify(['lgi-sync-heartbeat-v1', userId, dataset]) in try/catch; onmessage gate; onmessageerror = disconnect
- [`src/data/convex/heartbeat-session.ts:41, 44`](../../src/data/convex/heartbeat-session.ts#L41) — channel truthiness used as 'connected' for the leader gating
- [`src/data/convex/heartbeat-session.ts:96-99`](../../src/data/convex/heartbeat-session.ts#L96-L99) — the port type declared inline a second time
- [`src/mapper/tracking/JumpDoorbellObserver.tsx:54-62`](../../src/mapper/tracking/JumpDoorbellObserver.tsx#L54-L62) — injects openChannel: (name) => new BroadcastChannel(name) behind a typeof guard
- [`src/data/convex/use-sync-subject.ts:22-27`](../../src/data/convex/use-sync-subject.ts#L22-L27) — injects openChannel: (name) => new BroadcastChannel(name) with no typeof guard; relies on the session's try/catch
- [`src/data/convex/heartbeat-session.test.ts:10-54`](../../src/data/convex/heartbeat-session.test.ts#L10-L54) — TestChannel/TestBus fake (with failPosts and unavailable switches)
- [`src/mapper/tracking/doorbell-model.test.ts:198-242`](../../src/mapper/tracking/doorbell-model.test.ts#L198-L242) — near-identical TestChannel/TestBus fake

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/tracking/doorbell-model.ts:142-198, 244-264`](../../src/mapper/tracking/doorbell-model.ts#L142-L198) — Doorbell lease, entry, snapshot and message parsers: a different shape from the heartbeat's, with deliberate per-entry leniency and inFlight demotion. Not duplication, so leave them hand-rolled.
- [`src/data/convex/heartbeat-peers.ts:11-30`](../../src/data/convex/heartbeat-peers.ts#L11-L30) — Presence and peer-message parser, with the tabId self-filter inside receive (42-50). It is unit-tested through heartbeat-session.test.ts; keep it in the consumer.
- [`src/mapper/tracking/doorbell-model.ts:23-25, 210-235`](../../src/mapper/tracking/doorbell-model.ts#L23-L25) — The sessionStorage key also uses JSON.stringify([prefix, mapId]), but it is storage, not a channel.

</details>

**Home.** `src/lib/peer-channel.ts (shared test fake in src/lib/__tests__/broadcast-bus.ts, following the src/lib/__tests__/module-path.ts precedent)`

**Boundary check.** The primitive is in the lib zone (src/lib/**). The rule {from: lib, allow: [config]} holds trivially because the module has no imports. Consumer src/mapper/tracking/doorbell-model.ts is in the mapper zone, whose rule {from: mapper, allow: [features, data, components, ui, transport, lib, config]} includes lib. Consumer src/data/convex/heartbeat-session.ts is in the data zone, whose rule {from: data, allow: [..., transport, db, lib, config]} includes lib. The test fake under src/lib/__tests__ is lib zone and is imported by mapper and data tests under the same rules.

**API sketch.**

```ts
export type PeerChannelPort = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
};

export interface PeerChannel {
  readonly connected: boolean;
  post(message: unknown): void; // no-op when disconnected; disconnects if postMessage throws
  close(): void;                // idempotent; nulls handlers, swallows close() errors
}

export function openPeerChannel(input: {
  key: readonly string[];                 // name = JSON.stringify(key)
  open: (name: string) => PeerChannelPort; // injected seam (new BroadcastChannel in prod, bus.open in tests)
  onMessage: (data: unknown) => void;     // only invoked while connected
  onDisconnect?: () => void;              // once: open failure, messageerror, failed post, or close()
}): PeerChannel;
```

**Migration steps.**

1. Add src/lib/peer-channel.ts with PeerChannelPort and openPeerChannel. The handler wiring must happen before the function returns, so a consumer's synchronous post right after open works.
2. Move the heartbeat test's TestChannel/TestBus (the superset with failPosts and unavailable) to src/lib/__tests__/broadcast-bus.ts, typed against PeerChannelPort. Add src/lib/peer-channel.test.ts on that bus.
3. heartbeat-session.ts: replace channel, disconnect, the advertise try/catch and the open try/catch with const link = openPeerChannel({ key: ['lgi-sync-heartbeat-v1', input.userId, input.dataset], open: host.openChannel, onMessage: (data) => { if (!active) return; const kind = peers.receive(data, host.now()); ... } }). advertise becomes link.post({...}). Replace channel truthiness at lines 41 and 44 with link.connected, and call link.close() in stop(). Type host.openChannel as (name: string) => PeerChannelPort and delete the inline type at 96-99 and the Channel alias at 7. Then point heartbeat-session.test.ts at the shared bus.
4. doorbell-model.ts: replace channel, disconnect and the open try/catch with openPeerChannel({ key: [DOORBELL_CHANNEL_PREFIX, input.userId], open: input.openChannel, onMessage, onDisconnect: finishJoin }). share() becomes link.post({...}). The returned close stays () => { finishJoin(); link.close(); } so close() still resolves ready when the link is already down. Replace the DoorbellChannel type with PeerChannelPort (update JumpDoorbellObserver and doorbell-model.test.ts imports), delete doorbellChannelName, and point doorbell-model.test.ts at the shared bus.
5. Leave all parsers, the tabId and mapId filters, and the join handshake (timer, requestSnapshot) in the consumers. Do not introduce zod here.

**Tests.** New: src/lib/peer-channel.test.ts. Cover: the channel name equals JSON.stringify(key); onMessage fires only while connected; a throwing postMessage disconnects, nulls the handlers and fires onDisconnect once; onmessageerror disconnects; a throwing open gives connected=false, fires onDisconnect, and makes post a no-op; close() is idempotent and swallows a throwing port.close(). Existing guards that must stay green: src/data/convex/heartbeat-session.test.ts (failPosts, bus.unavailable, messageerror at line 255, leader selection) and src/mapper/tracking/doorbell-model.test.ts plus JumpDoorbellObserver.session.test.ts (join wait, snapshot exchange, closed-channel post).

**Notes.** Behavior to preserve: (1) Channel names must stay byte-identical, JSON.stringify(['lgi-atlas-doorbell-v1', userId]) and JSON.stringify(['lgi-sync-heartbeat-v1', userId, dataset]), so tabs on old and new deploys still hear each other. (2) The doorbell's disconnect also resolves the join wait (finishJoin), including when open throws, which is how the observer stops waiting 100 ms when channels are unavailable. Map that to onDisconnect and keep finishJoin in the doorbell's close wrapper. (3) The heartbeat's onmessage also gates on its own active flag; keep that in the consumer. (4) The heartbeat uses 'is the channel up' to decide whether to defer to a leader (lines 41 and 44); that must read link.connected, not a stale captured value. (5) JumpDoorbellObserver checks typeof BroadcastChannel before joining and treats 'no channel' as ready immediately. use-sync-subject relies on the try/catch catching the ReferenceError. Both still work with the primitive; keep the observer guard because it changes ready semantics. Dropped from the original proposal: zod schemas for the messages, and moving parse and the tabId filter into the primitive.

<sub>Reported by: area:mapper-chain.</sub>

<a id="p066"></a>

## P066: Extract postBeacon (sendBeacon with keepalive-fetch fallback) into src/transport

- **Status:** [x] done
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -18 lines at the two sites, +15 for the helper (net about 0); removes two dead catches and adds one tested fallback path
- **Depends on:** —
- **Existing primitive:** `src/transport/api-client.ts:apiFetch`

**Problem.** postTelemetry and postLeaveBeacon have the same body. Each checks that navigator.sendBeacon exists, posts a JSON Blob to endpoint.path, returns if that succeeds, and otherwise falls back to `apiFetch(endpoint, { body, keepalive: true })` with a `.catch` that cannot fire, because apiFetch never rejects. Only the endpoint and the body differ. The fallback branch is tested for neither site.

**Sites (5).**

- [`src/components/composition/telemetry/client.ts:8-18`](../../src/components/composition/telemetry/client.ts#L8-L18) — telemetry beacon + dead .catch(() => {})
- [`src/data/convex/leave-signal.ts:5-16`](../../src/data/convex/leave-signal.ts#L5-L16) — leave-sync beacon + dead .catch(() => undefined)
- [`src/data/telemetry/api-contract.ts:14-23`](../../src/data/telemetry/api-contract.ts#L14-L23) — POST, no params/query, 204
- [`src/data/convex/api-contract.ts:11-21`](../../src/data/convex/api-contract.ts#L11-L21) — POST, no params/query, 204
- [`src/transport/api-client.ts:28-47`](../../src/transport/api-client.ts#L28-L47) — apiFetch never rejects; CallInit already allows keepalive

**Home.** `src/transport/beacon.ts (or appended to src/transport/api-client.ts)`

**Boundary check.** transport: rule `from transport allow [lib]`; the helper imports only ./api-client and ./endpoint (same zone). Consumers: src/components/composition/telemetry/client.ts is components-composition, whose allow list includes transport. src/data/convex/leave-signal.ts is data, whose allow list includes transport.

**API sketch.**

```ts
export function postBeacon<const E extends EndpointContract<z.ZodTypeAny> & { method: 'POST' }>(
  endpoint: E & (RequiresUrlInput<E> extends true ? never : unknown) & { query?: undefined },
  body: RequestInputOf<E>,
): void
// sendBeacon(endpoint.path, new Blob([JSON.stringify(body)], { type: 'application/json' })) || void apiFetch(endpoint, { body, keepalive: true })
```

**Migration steps.**

1. Add src/transport/beacon.ts with postBeacon. Type it so only POST endpoints without path params or a query schema are accepted, because sendBeacon posts to endpoint.path verbatim. Inside, the apiFetch call may need a narrow cast because EndpointCallArgs<E> does not resolve for a generic E.
2. postTelemetry body becomes `postBeacon(telemetryEndpoint, buildTelemetryPayload(input))`.
3. postLeaveBeacon body becomes `postBeacon(leaveSyncEndpoint, { dataset: input.dataset, tabId: input.tabId })`.
4. Drop the now-unused apiFetch imports from both files.

**Tests.** Add src/transport/beacon.test.ts covering: sendBeacon true → no fetch; sendBeacon false → apiFetch with keepalive and the body; navigator missing → apiFetch; the Blob type is application/json. Keep src/data/convex/leave-signal.test.ts, which asserts the leave path and body.

**Notes.** No behaviour drift between the copies; only the dead `.catch` callbacks differ (`() => {}` vs `() => undefined`). Preserve the `typeof navigator !== 'undefined'` guard, so the helper is safe if it is ever imported during SSR.

<sub>Reported by: area:components-composition, area:data-services, area:ui-components, dupes-triage-1.</sub>

← [Wave 2: Tooling and test-harness foundations](wave-02-tooling-and-test-harness-foundations.md) · [Index](README.md#roadmap) · [Wave 4: Formatting, dates and names have one home](wave-04-formatting-dates-and-names-have-one-home.md) →
