# 3.x Price System — Implementation Plan

> Companion to [docs/PRICE_SYSTEM_DESIGN.md](docs/PRICE_SYSTEM_DESIGN.md) and
> [VERSION_3.0_PLAN.md](VERSION_3.0_PLAN.md). This document maps the
> design doc's architecture onto a sequenced PR slate, addresses the
> open questions left in the design, and flags conflicts / risks.

---

## Context

The Industry Planner (the 3.0 headline feature) needs:

1. Prices for ~6,000 type IDs (the materials and outputs of every
   manufacturing/reaction blueprint), versus the ~69 wormhole-site
   materials we track today.
2. The full recursive material tree for every blueprint, pre-computed
   so request-time renders don't traverse the SDE live.
3. A more durable price source — ESI replacing Fuzzwork, with
   per-row staleness, hourly bulk refresh, on-demand miss refill,
   advisory-locked bulk path, and a graceful Fuzzwork fallback.

The existing `VERSION_3.0_PLAN.md` sketches 3.0.2 → 3.0.5 around
"data foundations / math / UI / polish." That sketch predates the
PRICE_SYSTEM_DESIGN.md doc and does not budget for the price-system
rebuild that the doc requires. **The architecture does not map cleanly
onto the existing 4-slot split.** This plan proposes a revised slate
that keeps the 5-slot total (3.0.1 → 3.0.5) by being honest about what
fits in each PR and slipping UI polish into 3.1 if it doesn't.

---

## Proposed sub-version slate

| Sub-version | Theme | Sizing | Risk |
|---|---|---|---|
| 3.0.1 | Search platform extension (unchanged from existing plan) | medium | low |
| 3.0.2 | Market-prices schema + per-row staleness + cron + advisory lock (still Fuzzwork) | small/medium | low |
| 3.0.3 | ESI source rewrite + Fuzzwork fallback + rate-limit wrapper | medium | medium |
| 3.0.4 | Industry SDE schema + ingest + tree resolver + tracked-types seeding | **large** | **high** |
| 3.0.5 | Industry-math slice + Industry Planner UI + tile activation | large | medium |

If 3.0.5 sprawls, split it: math lands as 3.0.5, UI slips to 3.1.0.
Per VERSION_3.0_PLAN.md: "If scope balloons, slip work into 3.1
rather than letting 3.0 sprawl indefinitely."

### Why this ordering

The split runs **infrastructure → data → math → UI**. Each PR ships
something testable before the next is built on it:

- **3.0.2** rebuilds the staleness contract without changing what's
  fetched or where it's fetched from. The existing ~69-type pipeline
  keeps working; the new contract is exercised on the existing data.
  When this lands wrong, we know it's the contract, not the source.
- **3.0.3** swaps the source under the now-proven contract. ESI
  region-dump and per-type endpoint both feed the same upsert path
  that 3.0.2 established. If ESI is broken, Fuzzwork fallback keeps
  the pipeline alive — and the only consumer (wormhole-sites) is
  insulated. We get a full week of cron ticks against ESI on real
  production traffic before the industry types arrive.
- **3.0.4** is the big static-data PR. Adds the 6,000 industry types
  on top of an already-proven price pipeline. The first cron tick
  after merge fills them in.
- **3.0.5** consumes everything above.

---

## 3.0.1 — Search platform extension

**Scope unchanged** from VERSION_3.0_PLAN.md lines 61–90. Bundles the
three 2.9.4 carry-forwards (fuzzy matching, `AbortController`,
lazy-loaded source pattern) plus `onSelect?: (router) => void` on
SearchResult. Touches [src/data/search/](src/data/search/) and
[src/components/GlobalSearch.tsx](src/components/GlobalSearch.tsx).

Not part of the price-system rebuild; called out here only so the
slate is complete. The Blueprints search source built in 3.0.5 needs
the lazy-load + AbortController pieces, so 3.0.1 must precede it.

**Verification gate.** Typing "ffrd" finds "Forgotten Frontier
Recursive Depot." Typing "form" cancels in-flight "for" results.
Vitest green, including new fuzzy-matcher tests.

---

## 3.0.2 — Market-prices schema + per-row staleness

**What lands.**

- Drizzle migration adding columns to `market_prices`:
  `buy_volume bigint`, `sell_volume bigint`, `stale_after timestamptz
  NOT NULL`, `source text NOT NULL` (default `'fuzzwork'` in the
  migration so existing rows get a value). Index on `stale_after`.
- Backfill of `stale_after = updated_at + 1 hour` for every existing
  row (one-shot in the migration).
- New `src/data/market-prices/queries.ts` helpers:
  `listStaleTypeIds(db)` and `listMissingTypeIds(db, expectedIds)`.
- Rewrite of [src/data/market-prices/cache.ts](src/data/market-prices/cache.ts):
  `refreshKnownPricesIfStale` becomes `refreshStalePrices`, drops the
  `MAX(updated_at)` whole-table check, calls `listStaleTypeIds`.
- Per-row write path in `ingest.ts`: every upsert sets
  `stale_after = NOW() + TTL`, `source = 'fuzzwork'`, populates
  volume columns (Fuzzwork's `volume` field is in `FuzzworkSide`;
  we already parse it for orderCount and can pass through).
- Postgres advisory lock around the bulk refresh path. Lock ID lives
  in `constants.ts` as a named bigint.
- `vercel.json` cron declaration: `POST /api/cron/refresh-prices`
  hourly. New endpoint at
  [src/app/api/cron/refresh-prices/route.ts](src/app/api/cron/refresh-prices/route.ts),
  bearer-auth via `CRON_SECRET` (set in Vercel env).
- Existing manual-trigger `/api/market-prices/refresh` endpoint stays;
  internally now also calls the advisory-locked path. The `Refresh
  prices` command in the global search keeps working.

**What doesn't land.**

- No ESI source. Still Fuzzwork.
- No industry tables. ~69 tracked types unchanged.
- No region-dump path. The Fuzzwork batch fetcher already serves the
  whole tracked set in one HTTP round trip.

**Files modified.**

- [src/data/market-prices/schema.ts](src/data/market-prices/schema.ts) — columns + index.
- [src/data/market-prices/cache.ts](src/data/market-prices/cache.ts) — staleness logic.
- [src/data/market-prices/queries.ts](src/data/market-prices/queries.ts) — new helpers.
- [src/data/market-prices/ingest.ts](src/data/market-prices/ingest.ts) — stale_after on writes.
- [src/data/market-prices/constants.ts](src/data/market-prices/constants.ts) — TTL_MS, ADVISORY_LOCK_ID.
- New: `src/app/api/cron/refresh-prices/route.ts`.
- New: `vercel.json` (cron declaration).
- New migration in `/drizzle/`.

**Sizing.** Small/medium. One session, mostly schema + query refactor.

**Verification gate.**

- Migration applies cleanly on a fresh Neon preview branch; existing
  ~69 rows get backfilled `stale_after` values.
- `pnpm test` green; new tests for `listStaleTypeIds`,
  `listMissingTypeIds`, advisory-lock acquire/release on error.
- Manual cron POST against the preview deploy returns 200 with a
  refresh summary; second immediate POST returns 200 with `cached:
  true` (advisory lock + staleness both work).
- Wormhole-sites pages render with the same prices as before merge.

---

## 3.0.3 — ESI source rewrite + Fuzzwork fallback

**What lands.**

- [src/data/market-prices/source.ts](src/data/market-prices/source.ts)
  rewritten: ESI region dump (`GET /markets/{region_id}/orders/`)
  for bulk, per-type endpoint
  (`GET /markets/{region_id}/orders/?type_id={x}`) for on-demand.
- New `src/data/market-prices/source-fallback.ts` — the current
  Fuzzwork code lifted verbatim from today's `source.ts`. Becomes
  the circuit-breaker target.
- New `src/data/market-prices/esi-budget.ts` — thin wrapper around
  `fetch`. Reads `X-ESI-Error-Limit-Remain` on every response;
  refuses to dispatch new requests if below threshold (recommend
  20). Centralizes rate-limit handling so every ESI call goes
  through it (see Open Question #3 recommendation below).
- Streaming-aggregate pattern in the region-dump fetcher: process
  pages as they arrive, accumulate per-type buckets in a `Map`,
  never materialize the full order list. Page-level concurrency
  capped (recommend 8 simultaneous pages).
- Refresh path picks bulk vs per-type based on stale set size:
  threshold ~100 type IDs (below = per-type concurrent calls; above
  = region dump). Threshold lives in `constants.ts`.
- Circuit-breaker: if ESI returns 5xx on the bulk path, fall back to
  Fuzzwork batch for the same set. Mark rows with
  `source = 'fuzzwork-fallback'`. Log the fallback event to
  `usage_logs` (action: `prices_fallback_to_fuzzwork`).
- `RawMarketPrice` type extends with `buyVolume`, `sellVolume`,
  `source` fields.

**Wormhole-sites coverage from day one.**

The 69 type IDs currently seeded by wormhole-sites' ingest
(compressed gas, ore variants, salvage) are the only rows in
`market_prices` when 3.0.3 lands. The ESI source swap means **those
exact same 69 types are now fetched from ESI rather than Fuzzwork** —
no wormhole-sites code changes, no parallel pipeline. The hourly cron
tick refreshes them via ESI. The wormhole-site UI's "last price update"
chip flips from Fuzzwork-sourced data to ESI-sourced data with zero
visible UX difference (same Jita prices, same ~hourly cadence — actually
better, since the new per-row staleness drops the implicit 24h floor
to 1h).

This is the answer to "should the wormhole sites use the new system
in 3.0.3?" Yes — implicitly, because there's only one
`market_prices` table and one `source.ts`. The wormhole-sites slice
doesn't need to opt in; it gets the new source automatically.

Wormhole-sites' direct `refreshPrices(db, distinctTypeIds)` call in
its ingest (today's lines 236–250 of `wormhole-sites/ingest.ts`)
stays. That call still serves a real purpose: when the operator
re-runs the wormhole-sites ingest, the freshly-seeded type IDs need
prices immediately, not on the next cron tick. The call now goes
through the new advisory-locked path → ESI source. **Behavior
preserved; source upgraded.**

**What doesn't land.**

- No multi-region. Still Jita (10000002).
- No industry tables yet.
- No on-demand UI consumer yet (the per-type endpoint exists but the
  only caller is `refreshStalePrices` deciding which mode to use).

**Files modified.**

- [src/data/market-prices/source.ts](src/data/market-prices/source.ts) — full rewrite.
- New: `src/data/market-prices/source-fallback.ts`.
- New: `src/data/market-prices/esi-budget.ts`.
- [src/data/market-prices/ingest.ts](src/data/market-prices/ingest.ts) — pass through new fields.
- [src/data/market-prices/types.ts](src/data/market-prices/types.ts) — extend `RawMarketPrice`.
- [src/data/market-prices/constants.ts](src/data/market-prices/constants.ts) — BULK_THRESHOLD, PAGE_CONCURRENCY, ESI_BUDGET_FLOOR.

**Sizing.** Medium.

**Verification gate.**

- ESI region dump completes for The Forge in under 10s on Vercel
  serverless (instrument the cron handler with timing).
- Hourly cron tick succeeds against ESI; rows show `source = 'esi'`
  with non-null `buy_volume` / `sell_volume`.
- Forced ESI failure (env-flag `LGI_PRICE_FORCE_ESI_FAIL=1` or
  similar dev-only switch) routes to Fuzzwork; rows show
  `source = 'fuzzwork-fallback'`.
- Vitest tests: streaming aggregator returns correct best buy / best
  sell / volumes on a synthetic page stream; budget wrapper refuses
  to dispatch when remaining is below floor; per-type fetcher works
  in isolation.

---

## 3.0.4 — Industry SDE schema + ingest + tree resolver + seeding

**This is the largest and riskiest sub-version.** See "Risk and
de-risking" below.

**What lands.**

- Drizzle migration adding `industry_blueprints`,
  `industry_activities`, `industry_activity_materials`,
  `industry_activity_products`, `blueprint_trees`,
  `blueprint_flat_materials`. Indexes per the design doc.
- New CSV streaming inserts in
  [src/data/eve-data/ingest.ts](src/data/eve-data/ingest.ts) for
  the four `industry_*` tables. Same Fuzzwork bz2 pattern as the
  existing `dgmTypeAttributes` ingest.
- New `src/data/eve-data/tree-resolver.ts` — recursive walk with
  **memoization**, producing `tree_json` (nested) and flat-material
  rows. Cycle detection via visited-set (defensive; EVE has no real
  cycles).
- Post-ingest pass:
  - Tree resolver runs after SDE ingest commits (see Open Question
    #2 recommendation).
  - `listTrackedTypeIds()` derives the tracked set: **union of
    `industry_activity_materials.material_type_id` AND
    `industry_activity_products.product_type_id`** (see Open
    Question #6 recommendation — products are tracked too, not just
    materials; the math needs output prices).
  - Each tracked ID upserts into `market_prices` with null price
    columns, `stale_after = epoch` (immediately stale), `source =
    'esi'`. Existing rows (the ~69 wormhole-site types) preserved.
- **Wormhole-sites coexistence.** The industry-tables derivation
  naturally absorbs most of the wormhole-site types — **compressed
  gas types** (used as reaction inputs) and **salvage** (used in
  rig manufacturing) both appear in
  `industry_activity_materials.material_type_id`. **Ore types**
  (Veldspar, Mercoxit, …) **do not** — ore is reprocessed into
  minerals, and reprocessing is not a blueprint activity, so the
  industry tables only carry the resulting minerals (Tritanium,
  etc.), not the ores themselves.

  Practical consequence: after 3.0.4, the wormhole-sites ingest
  still seeds ore type IDs directly (no derivation source covers
  them). Gas + salvage seeding becomes redundant — the derivation
  picks them up — but the upsert is `ON CONFLICT DO NOTHING`, so
  leaving the wormhole-sites seeding code untouched is harmless.
  **Recommend leaving it.** Removing it is a code-cleanup item for
  3.1 once the new pipeline has run unmodified for a few weeks.
- New `src/data/eve-data/queries.ts` exports:
  `getBlueprintTree(blueprintId)`, `getFlatMaterials(blueprintId)`,
  `listTrackedTypeIds()`.
- New endpoint `src/app/api/cron/refresh-tracked/route.ts` — runs
  the tracked-types derivation. Called once at deploy time
  (post-ingest); also available as a manual recovery hook. Cron'd
  weekly to catch SDE drift between deploys.
- Idempotency hash for the tree resolver: store a checksum of the
  industry tables' row counts + a sample of edge values in a small
  metadata table; skip the resolver if unchanged (see Open Question
  #5 recommendation).

**What doesn't land.**

- No industry math (the flat materials are sitting in the DB
  unconsumed).
- No UI.
- No invention-chance handling. Invention is an activity, but the
  tracked set we derive only joins to manufacturing + reactions per
  the non-goals in the design doc.

**Files modified.**

- [src/data/eve-data/schema.ts](src/data/eve-data/schema.ts) — 6 new tables.
- [src/data/eve-data/ingest.ts](src/data/eve-data/ingest.ts) — 4 new CSV streams + tracked-types seeding.
- [src/data/eve-data/queries.ts](src/data/eve-data/queries.ts) — 3 new exports.
- New: `src/data/eve-data/tree-resolver.ts` + `tree-resolver.test.ts`.
- New: `src/app/api/cron/refresh-tracked/route.ts`.
- [vercel.json](vercel.json) — add weekly tracked-types cron.
- New migration in `/drizzle/`.

**Sizing.** Large. May warrant two PRs if 3.0.4a (industry CSV
ingest, no tree yet) ships separately from 3.0.4b (tree resolver +
flat materials + tracked-types seeding). Recommendation: keep as one
PR but be ready to split if the resolver work overruns.

**Verification gate.**

- Migration applies on a fresh Neon preview branch.
- Industry CSV ingest completes during `pnpm vercel-build` without
  timeout. Row counts logged: expect ~50k materials rows, ~8k
  blueprints, ~10k products.
- Tree resolver completes in under 60s on the Vercel build host
  (memoized; uncached recursion would balloon).
- Flat materials for **three reference blueprints** (Rifter, Drake,
  Archon) match externally-verified totals (test asserts known-good
  values; see "Risk and de-risking").
- After tracked-types seeding, `SELECT count(*) FROM market_prices`
  returns ~6,000 rows; ~5,931 have null prices and stale_after =
  epoch (the new ones); 69 retain their existing values (the
  wormhole-site types).
- First cron tick after merge fills the null-priced rows. Verify in
  Vercel runtime logs that the cron run reported `fetched ≈ 6000,
  written ≈ 6000` and elapsed under 30s.

---

## 3.0.5 — Industry-math slice + Industry Planner UI + tile activation

**What lands.**

- New shared-data slice: `src/data/industry-math/`.
  - `profitability.ts` — pure-function module. Takes
    `(flatMaterials, prices, params: { meTeEfficiency?, runs? })`,
    returns `{ materialCost, sellPrice, margin, marginPct,
    feasible }`. No DB calls, no I/O.
  - `profitability.test.ts` — unit tests against known-good values
    for the three reference blueprints (Rifter, Drake, Archon).
  - `queries.ts` — composed reader: blueprint ID → flat materials →
    join `market_prices` → call `profitability` → return computed
    result. **This is where the on-demand refresh path lives**: if
    any joined `market_prices` row has `stale_after < NOW()` or
    null prices, trigger the per-type ESI fetcher (via
    `market-prices/source.ts`), upsert, re-read, then compute.
- New feature slice: `src/features/industry/`.
  - `components/BlueprintPage.tsx` — server-rendered page body.
  - `components/MaterialTree.tsx` — collapsible tree of nested
    materials. **Reuses the wave-card collapsible pattern** from
    wormhole-sites; if the existing pattern isn't generic enough,
    extract a `CollapsibleGroup` primitive into `src/components/ui/`
    (see "Conflicts with CLAUDE.md" below).
  - `components/MarginPanel.tsx` — ISK math, ME/TE inputs.
  - `search.ts` — search source registering blueprint names via
    the 3.0.1 lazy-loaded pattern.
- New route: `src/app/industry/[id]/page.tsx`. Server Component;
  reads tree + flat materials + prices in parallel; runs math;
  renders.
- Tile flip on `/`: Industry Planner from "Coming Soon" to LIVE,
  linking to the new search-driven entry (the tile sends users to
  the global search, since there's no obvious default blueprint).
- NavTools strip: Industry Planner becomes a real link
  ([src/components/NavTools.tsx](src/components/NavTools.tsx)).
- Changelog entry: "Industry Planner — search any blueprint, see
  manufacturing profitability against live Jita prices."

**What doesn't land.**

- No invention math, no PI chains, no order-depth slippage (all
  non-goals in the design doc).
- No multi-character/alt support.
- No job-fee data (system cost indices — flagged as a known unknown
  in VERSION_3.0_PLAN.md). Recommend deferring to 3.1: first ship
  margin-before-fees, then add fees as a separate pass.

**Sizing.** Large. The math slice is testable in isolation; the UI
is where complexity lives. Acceptable split point if needed:
**3.0.5 = math + queries; 3.1.0 = UI**.

**Verification gate.**

- Profitability math test passes against the three reference
  blueprints' known-good values (input cost, output sell, margin).
- `/industry/<rifterId>` renders in dev with live Jita prices.
- Cold load of an unmapped blueprint (all materials stale) returns
  in under 2s on production hardware (the design doc's acceptance
  bar). Measure on Vercel runtime logs.
- Global search returns blueprint results when typing names (lazy
  source loads on first keystroke).
- Landing tile shows LIVE; nav strip "Industry Planner" navigates
  to a sensible landing.

---

## Open Questions — recommendations

The design doc deferred six questions for this planning pass. Each
gets a recommendation, with reasoning.

### 1. How to split this work across sub-versions

**Recommendation:** five sub-versions as proposed above, ordered
infrastructure → source → static data → math/UI. The existing
VERSION_3.0_PLAN.md sketch (data → math → UI → polish) is too
optimistic about how much "data" actually is — it folds the price
system rebuild and the industry-tables work into a single sub-version.
The revised slate splits the price system across 3.0.2 (contract)
and 3.0.3 (source), then dedicates 3.0.4 entirely to industry static
data. UI lands last and can slip to 3.1 if it doesn't fit.

### 2. Tree resolver inside the SDE ingest transaction or separate?

**Recommendation: separate post-ingest step.**

Reasons:
- The existing SDE ingest already runs in a transaction (see
  `src/data/eve-data/ingest.ts`); adding a recursive walk inside
  extends lock time and risks build timeouts.
- Atomicity isn't load-bearing: if the resolver fails, the SDE data
  is still valid and the resolver can be re-run via the
  `/api/cron/refresh-tracked` endpoint. The flat-materials table is
  what request-time reads anyway; if it's missing rows, the page
  shows a banner ("blueprint pending resolution") and the next cron
  tick fills it.
- Mirrors the existing pattern: SDE ingest commits, then
  `refreshPrices` runs outside the transaction (see
  `src/features/wormhole-sites/ingest.ts` lines 236–250). Same
  contract.

### 3. ESI rate-limit handling inside source.ts or in a wrapper?

**Recommendation: thin wrapper (`esi-budget.ts`).**

Reasons:
- Rate-limit budget is a cross-cutting concern. Every ESI call must
  respect it — the bulk region-dump path, the per-type on-demand
  path, and any future ESI calls (industry job fees, system cost
  indices, character data).
- Putting it in `source.ts` couples market-price logic to ESI infra
  logic; splitting them lets each get unit-tested independently.
- Concrete shape: `esi-budget.ts` exports `esiFetch(url, options)`
  that wraps `fetch`, reads `X-ESI-Error-Limit-Remain`, and refuses
  to dispatch (or throws a typed error caught by the fallback path)
  when remaining drops below the floor.

### 4. blueprint_trees as JSONB or normalized into edges?

**Recommendation: JSONB.**

Reasons:
- The cost math reads `blueprint_flat_materials`, not the tree.
  Tree is for UI display only.
- The UI reads the entire tree at once for a single blueprint —
  exactly the shape JSONB serves well. No partial-tree queries
  needed.
- A normalized `blueprint_tree_edges` table would be ~100k+ rows
  with no current consumer that needs SQL-side tree queries.
- If a future feature ("what blueprints use Tritanium?") needs edge
  queries, `industry_activity_materials` already serves that — it's
  the direct-edges table. The recursive tree is materialized into
  flat-materials, which serves the cost-math use case.

### 5. Detect "no schema change since last run" and skip the tree resolver?

**Recommendation: yes, opt-in skip with a force-rebuild flag.**

Reasons:
- Tree resolver is the slowest part of the ingest. Skipping it on
  unchanged SDE data is the biggest deploy-time win available.
- Implementation: a small `eve_data_meta` table (one row, key/value)
  storing a hash of (row count from `industry_blueprints` × row
  count from `industry_activity_materials` × a sample checksum).
  After successful resolve, write the hash. On next ingest, compute
  current hash; if matches, skip.
- Force-rebuild needed when the resolver itself changes (e.g., a
  bug fix). Env var `LGI_FORCE_TREE_REBUILD=1` or a CLI flag on the
  ingest script.

### 6. How do existing wormhole-site prices coexist with the new derived set?

**Recommendation: union with upsert-preserve semantics.**

Reasons:
- Both seed `market_prices`. The wormhole-sites ingest already
  upserts ~69 IDs with null prices, then immediately refreshes
  them. The new tracked-types derivation upserts ~6,000 IDs (some
  overlapping the 69) with null prices and `stale_after = epoch`.
- Merge semantics: **upsert only if not present**. Concretely:
  `INSERT ... ON CONFLICT (type_id) DO NOTHING`. Existing rows
  preserve their existing values; new rows arrive null + stale.
  This avoids the "you just wiped my fresh wormhole prices" failure
  mode.
- The tracked set is `union(materials.material_type_id,
  products.product_type_id)`. **This is a correction to the design
  doc** — see "Decisions to push back on" #1 below.

---

## Conflicts with CLAUDE.md

The design doc respects most of the project's conventions cleanly.
One conflict and one ambiguity worth raising:

### Conflict: Material-tree UI reuses, not invents, the wave-card collapsible

CLAUDE.md is explicit: *"A wave card is not a wormhole component —
it is a collapsible group-of-entities component fed wormhole data
today. Future features use the same primitives with different
data."*

The Industry Planner's nested material tree is exactly the second
consumer. The design doc doesn't say this. **Plan must reuse the
existing wave-card collapsible behavior, not build a parallel
`MaterialTree` primitive.** If the existing wave-card code in
`src/features/wormhole-sites/components/` is too feature-coupled,
extract a `CollapsibleGroup` primitive into `src/components/ui/`
in 3.0.5 as part of the UI work — but don't build a one-off.

### Ambiguity: Industry math slice placement

The design doc puts industry math in `src/data/industry-math/` —
correct per CLAUDE.md (`src/data/` is shared data layers; features
don't import from each other). But the design also says the math
slice has a `queries.ts` that imports from both `eve-data` and
`market-prices`. That's fine — they're shared data layers, both
upstream of math. **The UI feature slice (`src/features/industry/`)
imports from `industry-math`, which imports from `eve-data` and
`market-prices`. No feature-to-feature imports.** Plan must enforce
this; the verification checklist in the design doc already includes
"No code in `src/features/` imports from another feature" — keep
that as a literal grep check.

No conflicts on:
- Slice isolation (eve-data ⊥ market-prices) — design doc explicit.
- Configuration over repetition — TTLs / lock IDs / concurrency caps
  all consolidate in `constants.ts`.
- Schema extensibility — `source` is `text` not enum (matches the
  `action` precedent in `usage_logs`); new columns are nullable
  where the data justifies it.
- Test placement — tests live next to source.

---

## Decisions in the design doc to push back on

Six items worth flagging. None are blocking; all are easier to
address now than mid-implementation.

### 1. Tracked set is materials AND products, not just materials

The design doc says:

> "tracked type IDs are derived ... by selecting all distinct
> `typeId` values that appear in `industry_activity_materials`."

But profitability math is `output_sell_price - input_buy_cost`. We
need **output prices too**. The tracked set must be:

```
union(
  SELECT DISTINCT material_type_id FROM industry_activity_materials,
  SELECT DISTINCT product_type_id  FROM industry_activity_products
)
```

This expands the tracked set somewhat (T2 ships, T1 modules, etc.
become tracked outputs in addition to being inputs to higher-tier
recipes — most overlap is expected). Worth confirming before 3.0.4.

### 2. The 2-second on-demand bar is ambitious; budget it

Acceptance bar: "On-demand refresh path returns within 2 seconds
for a typical T2 blueprint (15–25 materials, all stale) on
production hardware."

25 ESI per-type calls in parallel ≈ 200-500ms each + connection
overhead + DB upsert + math = realistically 800-1500ms. Achievable
but the budget is tight. **Recommend** a spike during 3.0.3 to
measure actual ESI per-type latency from Vercel's serverless
runtime; if median is above 600ms, either raise the bar (3s) or
prefetch popular blueprints' prices via the hourly cron.

### 3. Streaming aggregation pattern needs explicit shape

The design doc warns "never materialize the full order list" but
doesn't sketch the implementation. The shape should be:

```ts
for await (const page of pagedOrders(regionId)) {
  for (const order of page) {
    const bucket = aggregator.get(order.type_id) ?? newBucket();
    bucket.absorb(order);
    aggregator.set(order.type_id, bucket);
  }
}
return [...aggregator].map(toRawMarketPrice);
```

The aggregator only holds `Map<typeId, { bestBuy, bestSell,
buyVolume, sellVolume, top5BuyPrices, top5SellPrices }>` — ~6,000
keys × small payload, comfortably under serverless memory ceiling.
Worth pre-writing this as a test against synthetic page streams
before wiring the real ESI fetcher.

### 4. Advisory lock ID needs to be a named constant

Postgres advisory locks take a bigint key. Define it once:

```ts
// src/data/market-prices/constants.ts
export const ADVISORY_LOCK_REFRESH = 8273619012n; // arbitrary, project-unique
```

Document the namespace in a comment (this is the only lock today;
when a second lock appears, namespace by feature: high 32 bits =
feature, low 32 bits = lock kind).

### 5. Auth on the cron endpoint vs the manual endpoint

The existing `/api/market-prices/refresh` has no auth — relied on
the 24-hour TTL as a rate-limit. With per-row staleness, that
implicit rate-limit weakens. **Recommend:**

- New `/api/cron/refresh-prices` requires `Authorization: Bearer
  $CRON_SECRET` (Vercel cron supplies it automatically).
- Existing `/api/market-prices/refresh` stays unauthenticated but
  starts returning `{ cached: true }` immediately if anything ran
  in the last minute (a soft rate-limit, separate from the
  per-row TTL). The "Refresh prices" command in the global search
  remains usable without breaking anything.

### 6. Staleness indicator UX is under-specified

The design doc says: "If both ESI and Fuzzwork are down ... the
system returns whatever prices are in the database with a visible
staleness indicator." Where? Recommend the existing
`<PriceFreshness>` chip in `AppHeader` flips orange (instead of
green) when ANY row in the user's current view has `stale_after`
older than the next-expected refresh window — i.e., the chip
reflects "the price layer is healthy" platform-wide, not "this
specific blueprint's prices are fresh." Per-row staleness UX (a
small badge next to materials with stale prices) is a 3.0.5+ polish
item.

---

## Risk and de-risking

**Riskiest sub-version: 3.0.4** (industry SDE + tree resolver +
seeding).

Reasons:
- Largest schema change (6 new tables).
- New CSV ingest paths in the existing transaction-wrapped pipeline
  — risk of build timeout.
- Recursive tree algorithm where memoization correctness is
  load-bearing. Uncached recursion balloons to minutes.
- Hard to roll back: once 6,000 rows are seeded into
  `market_prices`, reverting needs a migration to drop columns +
  truncate the new tables.
- The first cron tick after merge has to fill 6,000 null-priced
  rows. If the ESI bulk path silently skips them (e.g., a typo in
  the staleness query), the Industry Planner sees null prices and
  the math returns NaN.

**De-risking — three steps before the main PR.**

1. **Standalone tree-resolver spike.** Before opening the 3.0.4 PR,
   build the resolver as a standalone script under
   `scripts/spike-tree-resolver.ts` (or similar — outside `src/`).
   Read from a local Postgres branch with the new tables populated
   from CSVs. Validate against 5–10 known blueprints (Rifter,
   Drake, Archon, a simple reaction, a T2 frigate, a T3 cruiser
   subsystem). Output: flat materials list. Compare to known-good
   values from third-party industry tools or manual computation.
   Time-budget the whole run.

   Deliverable: the spike script + a one-paragraph note in the
   3.0.4 PR description confirming the resolver works against the
   reference blueprints and completes in under N seconds.

2. **Pin known-good values as test data.** Before 3.0.4's resolver
   merges, capture the exact flat-materials totals for the
   reference blueprints (e.g., "Rifter requires 21,330 Tritanium +
   ...") and commit them as test fixtures
   (`src/data/eve-data/tree-resolver.test.ts`). The test asserts
   the resolver produces these exact totals. Locks in correctness
   regression-wise: any future change to the resolver that breaks
   reference values fails CI.

3. **Cron health check in the 3.0.4 merge window.** Add a one-shot
   verification after the first post-merge cron tick: log the count
   of `market_prices` rows with non-null `best_buy` or `best_sell`.
   Expected: ≈ 6,000. If significantly less (say, < 5,500), the
   bulk path is silently failing on some types. Treat this as a
   merge-window check, not a permanent monitor.

**Secondary risk: 3.0.3** (ESI source rewrite).

The streaming aggregator and the ESI budget wrapper are both new
patterns. Mitigations:
- Stream-aggregator gets its own unit test using a synthetic
  paginated stream (mock the `pagedOrders` iterator) before wiring
  the real ESI fetcher.
- ESI budget wrapper gets a forced-failure test (mock `fetch` to
  return a low remaining-header) verifying the refusal path fires.
- Feature flag the ESI source for the first deploy: env var
  `LGI_PRICE_SOURCE=esi|fuzzwork` chooses which path runs. Default
  `esi`, flip to `fuzzwork` from Vercel if anything goes sideways.
  Remove the flag once ESI has run for a week without incident.

---

## Out of scope for 3.0 (deferred to 3.1+)

These appear in the design doc or VERSION_3.0_PLAN.md as known
unknowns / future concerns:

- Industry job-fee math (system cost indices from
  `/v1/industry/systems/`). Margin-before-fees ships in 3.0.5;
  fees in 3.1.0.
- Multi-region pricing (Amarr, Dodixie, Hek). Architecture (region
  param threaded through `source.ts`) is ready; UI surface deferred.
- Order-depth slippage modeling. Volumes are tracked; math doesn't
  use them yet.
- Invention chance math.
- PI production chains.
- Per-user pricing preferences.
- Per-row staleness UX (small "stale" badges on individual
  materials in the tree).
- Extraction of the price system into a separate service.

---

## Verification — end-to-end

Once all five sub-versions ship, the design doc's verification
checklist plus the following user-facing checks pass:

- Visit `/` → see Wormhole Sites + Industry Planner both LIVE.
- Type a blueprint name in the global search → see blueprint results
  → click one → land on `/industry/<id>` with a fully-rendered
  material tree + margin panel within 2 seconds (warm cache) or
  under 3 seconds (cold/stale cache).
- Tune ME/TE → margin updates without page reload.
- Open the same blueprint a second time → no on-demand ESI calls
  fire (cache hit).
- Force an ESI outage in dev (env switch) → page still renders with
  the most recent prices and the freshness chip turns orange.
- `pnpm vercel-build` on a preview branch completes within Vercel's
  build-timeout budget; first cron tick after deploy populates
  ~6,000 prices in under 30 seconds.
- `pnpm test` green across `industry-math`, `tree-resolver`,
  `esi-budget`, `source` (region-dump aggregator).

---

## Handoff

When the next implementation session starts:

1. Decide whether to merge this plan into `VERSION_3.0_PLAN.md` or
   leave it as a companion doc. The slate is the same shape, just
   more detailed — either choice works.
2. `SCRATCHPAD.md` already carries a continuity pointer to this
   plan; update it if the plan moves. `PRICE_SYSTEM_DESIGN.md`
   remains the source of truth for *what*; this document is the
   source of truth for *how* and *when*.
3. Open 3.0.1 first (search-platform extension) — it's the lowest
   risk and unblocks the global-search blueprint source in 3.0.5.
