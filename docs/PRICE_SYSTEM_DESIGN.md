# LGI.tools — Price System Design

## What This Is

A design document for the price fetching, caching, and aggregation system
that underpins the Industry Planner (3.0+). Defines the architecture, data
model, and module boundaries — not the implementation details, sub-version
sequencing, or sprint plan. That's for the implementation plan to produce
after reading this.

Two distinct concerns are addressed together because they share
infrastructure but have very different lifecycles: the **static blueprint
dependency tree** (changes only on game patches) and the **dynamic market
prices** (refreshed continuously from ESI). Treating them as one system
in this doc keeps the boundaries between them honest.

---

## How to Use This Document

This is the source of truth for *what* the price system looks like.
Sub-version planning happens in `VERSION_3.0_PLAN.md` and successors.
If reading this doc surfaces a desire to deviate from the architecture,
raise it as a conflict before proceeding rather than silently changing
course.

Read this alongside `CLAUDE.md`, `AGENTS.md`, the current
`src/data/market-prices/` slice, and the SDE schema in
`src/data/eve-data/schema.ts` before proposing implementation.

---

## Context

Today the price system fetches market data from Fuzzwork on a 24-hour
cache TTL (dropping to 1 hour in 2.9.5) and stores it in a single
`market_prices` table keyed by `type_id`. The ~69 tracked items are
wormhole-site materials seeded by the wormhole-sites ingest.

The Industry Planner (3.0+) needs prices for every type that appears as
a material input in any manufacturing or reaction blueprint — roughly
5,000–8,000 unique type IDs. It also needs the full recursive
dependency tree for every blueprint so that a user looking up an Archon
sees not just its direct components but every raw mineral and
intermediate product all the way down.

This is a substantial change in scale (~100x more priced items) and a
substantial change in scope (a new static data layer for blueprint
trees). Both changes need to happen together because the Industry
Planner consumes both.

---

## Decisions Already Made

### Two layers, two lifecycles

- **Static blueprint data** (categories, groups, types, blueprints,
  activities, materials, products) comes from the SDE and is ingested
  at deploy time. Re-ingest is triggered by game patches, not by user
  activity. Lives in the `eve-data` slice.

- **Dynamic price data** (best buy, best sell, percentiles, volume per
  type ID) comes from ESI and is refreshed on a cron schedule plus
  on-demand for misses. Lives in the `market-prices` slice.

The two slices must not import each other. Cross-cutting code (the
Industry Planner math) sits above both and imports each independently.

### ESI replaces Fuzzwork as the price source

The `source.ts` abstraction was deliberately designed to allow this
swap. Reasons for the change:

- Official API operated by Fenris Creations rather than a community
  service.
- Order-depth data available natively (Industry Planner needs to know
  whether enough sell orders exist to actually fill a manufacturing
  run).
- Per-type freshness tracking aligns with ESI's per-region 5-minute
  server cache.
- No dependency on a service that could go dark with little notice.

Fuzzwork is retained as a **fallback only** — if ESI returns 5xx for a
refresh attempt, the system can degrade to Fuzzwork rather than
returning stale data indefinitely. This is a circuit-breaker concern,
not a routing decision.

### Region dump for bulk, per-type for on-demand

At ~6,000 tracked type IDs, fetching individually per type would mean
6,000 ESI calls per hourly refresh. The region dump endpoint
(`GET /markets/{region_id}/orders/`) returns all orders for a region
in pages of 1,000. Jita's full order set is ~400,000–600,000 orders,
or ~500 pages. With page-level concurrency, a full refresh completes
in under 10 seconds.

On-demand requests for a specific type use the per-type endpoint
(`GET /markets/{region_id}/orders/?type_id={x}`). One call, no paging,
used only for cache misses (rows with null prices or `stale_after <
NOW()`).

### Per-type freshness, not whole-table

The current `MAX(updated_at)` whole-table freshness check is replaced
by per-row `stale_after` tracking. Each `market_prices` row has its
own staleness state. The staleness check is `WHERE stale_after < NOW()`
returning the set of types that need refreshing. Both bulk and
on-demand paths use the same staleness query, just with different
filters.

### Blueprint trees are pre-computed and stored

The recursive walk from a target blueprint down to raw materials runs
once at SDE ingest time, not per-request. Two outputs are stored:

- A **structured tree** (JSON, one row per blueprint) for UI display
  of the nested parent → child → grandchild structure.
- A **flattened raw-materials list** (one row per blueprint × leaf
  type ID) for cost math.

Both regenerate when the SDE is re-ingested. The Industry Planner
reads pre-computed rows at request time; it does not walk the tree
live.

### Tracked type IDs are derived, not enumerated

After SDE ingest, the set of "types we need prices for" is computed
as the **union** of:

- All distinct `material_type_id` values in
  `industry_activity_materials` (manufacturing + reaction inputs).
- All distinct `product_type_id` values in
  `industry_activity_products` (manufacturing + reaction outputs).

Both sides are required because the profitability math is
`output_sell_price − input_buy_cost` — we need live prices for the
outputs as well as the inputs. Most types appear on both sides (a T1
module is a manufactured output and also an input to higher-tier
recipes) so the union is mostly overlap.

These types are seeded into `market_prices` with null price columns
and `stale_after = epoch` (immediately stale). The first bulk
refresh after ingest fills them in. There is no manually maintained
"list of items to track" — the SDE defines it.

### Stays inside the LGI Tools repo

The price system is **not** extracted into a separate service. It
remains a slice within the existing Next.js codebase. The `source.ts`
boundary means a future extraction (to a standalone API or Cloudflare
Worker) is a one-file replacement, but is deferred until there is a
concrete reason to split.

---

## Data Model

### New SDE tables (added to `src/data/eve-data/schema.ts`)

```
industry_blueprints
  blueprint_type_id      integer    PK (references eve_types.id)
  max_production_limit   integer

industry_activities
  blueprint_type_id      integer    references industry_blueprints
  activity_id            integer    (1 = manufacturing, 11 = reactions, etc.)
  time_seconds           integer
  PK (blueprint_type_id, activity_id)

industry_activity_materials
  blueprint_type_id      integer
  activity_id            integer
  material_type_id       integer    references eve_types.id
  quantity               integer
  PK (blueprint_type_id, activity_id, material_type_id)
  INDEX on material_type_id    -- used by tracked-types derivation

industry_activity_products
  blueprint_type_id      integer
  activity_id            integer
  product_type_id        integer    references eve_types.id
  quantity               integer
  probability            double precision  -- for invention
  PK (blueprint_type_id, activity_id, product_type_id)
  INDEX on product_type_id     -- used to find "what blueprint produces type X"
```

### New computed tables (in `eve-data` schema, written by the tree resolver after SDE ingest)

```
blueprint_trees
  blueprint_type_id      integer    PK
  tree_json              jsonb      -- nested structure for UI display
  computed_at            timestamptz NOT NULL

blueprint_flat_materials
  blueprint_type_id      integer
  raw_material_type_id   integer
  total_quantity         bigint     -- accumulated from full recursive walk
  PK (blueprint_type_id, raw_material_type_id)
  INDEX on blueprint_type_id
```

### Changes to `market_prices` (in `src/data/market-prices/schema.ts`)

```
market_prices
  type_id        integer    PK
  best_buy       double precision           -- nullable
  best_sell      double precision           -- nullable
  pct5_buy       double precision           -- nullable
  pct5_sell      double precision           -- nullable
  buy_volume     bigint                     -- NEW
  sell_volume    bigint                     -- NEW
  updated_at     timestamptz NOT NULL
  stale_after    timestamptz NOT NULL       -- NEW: row-level expiry
  source         text NOT NULL              -- NEW: 'esi' | 'fuzzwork-fallback'
  INDEX on stale_after
```

---

## Module Layout

```
src/data/eve-data/
  schema.ts             -- + industry_* tables, blueprint_trees, blueprint_flat_materials
  ingest.ts             -- + SDE industry CSV streaming inserts
  tree-resolver.ts      -- NEW: recursive walk → trees + flat materials
  queries.ts            -- + getBlueprintTree, getFlatMaterials, listTrackedTypeIds

src/data/market-prices/
  schema.ts             -- + buy_volume, sell_volume, stale_after, source
  source.ts             -- REWRITE: ESI region dump + per-type endpoint
  source-fallback.ts    -- NEW: Fuzzwork fallback (simple, retained from current source.ts)
  ingest.ts             -- + concurrent batch processing, source attribution
  cache.ts              -- per-row staleness, advisory lock around refresh
  queries.ts            -- + listStaleTypeIds, listMissingTypeIds
  constants.ts          -- TTLs, concurrency limits, advisory lock ID

src/data/industry-math/         -- NEW SLICE
  schema.ts                     -- (only if persisted computed results needed)
  profitability.ts              -- pure math: materials × prices → ISK margins
  profitability.test.ts         -- unit tests against known-good values
  queries.ts                    -- composed: blueprint → materials → prices → margin

src/app/api/cron/
  refresh-prices/route.ts       -- existing endpoint, rewritten for new bulk path
  refresh-tracked/route.ts      -- NEW: re-derive tracked type IDs (post-ingest)

src/app/api/industry/
  blueprint/[id]/route.ts       -- NEW: returns tree + flat materials + live prices
```

---

## Data Flows

### Flow 1 — SDE ingest (deploy-time, Vercel build step)

1. `vercel-build` script runs migrate + ingest-if-empty + next build.
2. SDE ingest (now expanded) downloads Fuzzwork's CSV dumps for the
   new industry tables.
3. Streaming inserts populate `industry_blueprints`,
   `industry_activities`, `industry_activity_materials`,
   `industry_activity_products`.
4. `tree-resolver.ts` runs as a post-ingest pass: for each blueprint,
   recursively walk materials → produce `tree_json` and flat-material
   rows.
5. `listTrackedTypeIds()` computes the distinct material type IDs
   from `industry_activity_materials`.
6. Each tracked type ID is upserted into `market_prices` with null
   prices and `stale_after = epoch` (only if not already present —
   existing prices are preserved).
7. Build completes. First cron tick will refresh the new tracked
   types.

### Flow 2 — Bulk price refresh (cron, hourly)

1. Vercel cron POSTs `/api/cron/refresh-prices` with Bearer auth.
2. Endpoint acquires a PostgreSQL advisory lock; if lock fails,
   returns 200 immediately (another refresh in progress).
3. Calls `listStaleTypeIds()` — returns the set of tracked types with
   `stale_after < NOW()`.
4. If empty, releases lock and returns.
5. Calls `fetchPricesFromSource(staleTypeIds)`:
   - Triggers ESI region dump for The Forge (~500 paginated requests,
     concurrent with a concurrency cap).
   - Streams orders, filters in memory to the staleTypeIds set.
   - Aggregates per type: best buy/sell, 5th-percentile buy/sell,
     total volume on each side.
   - Returns normalized `RawMarketPrice[]`.
6. If ESI fails (5xx or network), falls back to Fuzzwork batch
   fetcher for the same type IDs; marks rows with
   `source = 'fuzzwork-fallback'`.
7. Upserts all rows into `market_prices` with `updated_at = NOW()`,
   `stale_after = NOW() + TTL`.
8. Releases advisory lock.
9. Returns refresh summary in the response body for log capture.

### Flow 3 — On-demand price refresh (user request triggers it)

1. User hits `/industry/<blueprintId>` page.
2. Server-rendered loader fetches the flat-materials list and joins to
   `market_prices`.
3. Loader identifies rows where `stale_after < NOW()` OR price columns
   are null.
4. If any, calls `fetchPricesFromSource(staleSubset)` using the
   per-type ESI endpoint (one call per type, concurrent).
5. Upserts results back into `market_prices` with normal TTL.
6. Re-queries fresh prices, runs profitability math, renders page.

### Flow 4 — Cached blueprint lookup (steady state)

1. User hits `/industry/<blueprintId>` page.
2. Loader fetches `blueprint_trees.tree_json` (one row),
   `blueprint_flat_materials` (one query), `market_prices` (one query
   with `WHERE type_id IN (...)`).
3. Application code joins them, runs profitability math.
4. Page renders. No ESI calls, no Fuzzwork calls, no tree traversal
   at request time.

---

## Failure Modes to Plan For

- **ESI region dump partial failure.** Some pages succeed, others time
  out. Refresh logic must tolerate partial results: write what
  succeeded, leave the rest stale, log the failure. Don't fail the
  whole batch on one bad page.
- **Concurrent refresh attempts.** Cron tick lands while a previous
  tick is still running. The advisory lock prevents double-refresh;
  the second caller exits cleanly without queuing.
- **On-demand refresh during bulk refresh.** User triggers an
  on-demand fetch for a type ID while the bulk job is mid-flight. Both
  write to `market_prices`; last-writer-wins is acceptable since both
  are writing fresh ESI data. No coordination needed beyond the upsert
  pattern.
- **ESI rate limit error budget approaching exhaustion.** Read
  `X-ESI-Error-Limit-Remain` on every response. If below 20, abort
  the current refresh and back off. Better to leave prices stale than
  to get a full IP ban.
- **SDE patch invalidates the tree.** A new game patch changes a
  blueprint's materials. Until the next SDE ingest, the tree is wrong.
  Mitigation: surface a "last SDE refresh" timestamp in the UI footer;
  automate SDE refresh on a weekly cadence in addition to deploy-time.
- **Fuzzwork fallback also fails.** If both ESI and Fuzzwork are down,
  the system returns whatever prices are in the database with a
  visible staleness indicator. Never block a page render on a
  successful price refresh.
- **Tree cycles.** EVE manufacturing has no true cycles, but
  defensive: the resolver tracks visited types in its recursion and
  aborts the path with a logged warning if it ever sees a repeat.
  Should never fire in practice.
- **Memory pressure during region dump aggregation.** Holding ~500K
  order rows in memory while aggregating is fine on Vercel's
  serverless function memory ceiling, but the streaming-aggregate
  pattern (process page-by-page, accumulate only the per-type
  aggregates) is required — never materialize the full order list.

---

## Non-Goals

- **No support for non-Jita regions in v1.** Jita-only. Region
  abstraction stays in `source.ts`; multi-region is a future concern.
- **No per-user pricing preferences (buy at Jita / sell at Amarr).**
  All math uses Jita best buy for material cost and Jita best sell for
  output sell price. ME/TE efficiency is a user-adjustable input but
  market preference is not.
- **No invention chance math in v1.** Invention is an activity, but
  the profitability math covers manufacturing and reactions only.
- **No PI production chain math.** Planetary interaction product
  prices are tracked (they appear as materials in T2 manufacturing)
  but PI production chains are not modeled.
- **No order-depth slippage modeling in v1.** Profitability uses best
  price × quantity, not "if I buy 1M units, what's the average price
  after I clear the top of the book." Volume is tracked but not yet
  incorporated into the math.
- **No extraction into a separate service.** Stays in the LGI Tools
  repo. The boundary is drawn in `source.ts` so this can change later.

---

## Open Questions for the Implementation Plan

These are intentionally left open for the agent's planning pass:

- How to split this work across sub-versions of 3.x. The existing
  `VERSION_3.0_PLAN.md` sketches 3.0.2 → 3.0.5 — does the architecture
  above suggest a different split, or does it map cleanly?
- Whether the tree resolver runs inside the SDE ingest transaction or
  as a separate post-ingest step. Performance vs. atomicity trade-off.
- Where ESI rate limit headers are read and where the back-off lives —
  inside `source.ts` itself, or in a thin wrapper around it.
- Whether `blueprint_trees.tree_json` should be JSONB or normalized
  into a `blueprint_tree_edges` table for queryability. JSONB is
  simpler; edges are more flexible for partial-tree lookups.
- Whether the SDE ingest should detect "no schema change since last
  run" and skip the tree-resolver pass (idempotency + speed for hot
  deploys).
- How the existing wormhole-site material prices coexist with the new
  derived-from-SDE tracked set. Likely a union, but worth confirming
  the merge semantics.

---

## Verification Checklist (for whoever implements this)

Before any 3.x sub-version implementing this design is considered
complete, all items below must be true:

- [ ] No code in `src/features/` imports from another feature.
- [ ] No code in `eve-data` imports from `market-prices` or vice versa.
- [ ] `market_prices.stale_after` is set on every write.
- [ ] Bulk refresh succeeds against a fresh database (no rows) without
      throwing.
- [ ] On-demand refresh path returns within 2 seconds for a typical
      T2 blueprint (15–25 materials, all stale) on production hardware.
- [ ] Pre-computed flat materials for a known blueprint (e.g.
      Rifter, Drake, Archon) match an externally-verified material
      total (test against known-good values).
- [ ] Tree resolver completes for all blueprints in under 60 seconds
      on the Vercel build host.
- [ ] ESI error-limit header is read and respected on every response.
- [ ] Advisory lock around the bulk refresh path is acquired and
      released even on error.
- [ ] CHANGELOG.md entry written for user-visible changes only.
- [ ] SCRATCHPAD.md updated with what shipped and what's next.
