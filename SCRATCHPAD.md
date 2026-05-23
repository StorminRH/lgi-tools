# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Phase 2 — Session B (market-prices): COMPLETE (2026-05-23)

The `src/data/market-prices/` slice exists and ships live Jita
prices end-to-end:

- **Schema:** one table — `market_prices`. PK is the Eve type ID
  (no FK to `eve_types`, by design — the two data slices stay
  decoupled at the schema level). Four `double precision` price
  columns are nullable; an empty market side (`orderCount == 0`)
  stores NULL so Session C can distinguish "no live price" from a
  real value. `updated_at` is NOT NULL with no default — set in
  code so a single batch shares one timestamp, which Session D's
  cache check (`MAX(updated_at)`) reads as a clean signal.
- **Source (`source.ts`):** the only file that knows about
  Fuzzwork. Hits the aggregates endpoint at
  `market.fuzzwork.co.uk/aggregates/?region=10000002&types=…` with
  comma-separated IDs, **chunked at 150 per request** to keep URL
  length safe. Future ESI swap replaces this file alone.
- **Ingest (`ingest.ts`):** `refreshPrices(db, typeIds)` calls the
  source, computes one `new Date()` for the batch, upserts via
  `.onConflictDoUpdate({ target: typeId, set: excluded.* })`. No
  cache — Session D will wrap it.
- **Query API (`queries.ts`):** `getPrices(typeIds)` returns a
  `Map<number, MarketPrice>`. Read-only; mirrors the
  `getTypesByIds` shape in `eve-data`.
- **CLI:** `pnpm db:refresh-prices [csv-ids]` — defaults to
  Tritanium / Pyerite / Mexallon (34,35,36). Round-trips the IDs
  through `refreshPrices` then `getPrices` and prints both, so a
  bare run proves the public read API agrees with what was just
  written. `:prod` variant is wired but not yet exercised.
- **Migration:** `drizzle/0003_adorable_senator_kelly.sql`.
  Applied locally; **not yet applied to Neon prod**.
- **Decoupling verified.** `src/data/market-prices/` has zero
  imports from `@/features` and zero from `@/data/eve-data`.
  `src/features/` has zero imports from `@/data/market-prices`
  (becomes non-empty in Session C).
- **Local verification.** Refresh on the sanity trio populates
  three rows with all four prices set; re-run advances
  `updated_at` without changing row count; adding Morphite (11399)
  upserts a fourth row without touching the first three. Morphite
  shows a normal spread (buy 21,620 / sell 22,990); minerals show
  a real Jita inversion (buy.max > sell.min) — Fuzzwork is correct,
  it's just that someone left an inflated buy order sitting at the
  top of the book. The slice stores what Fuzzwork reports.
- **`pnpm build` + `pnpm lint`** both green.

### Session C should start with

- Read `src/features/wormhole-sites/ingest.ts`,
  `sheet-parser.ts`, and a sample of real `resource_name` values
  from the DB before deciding the mapping rules. Confirm with
  the user (see Session C "Known unknowns" in PHASE_2_PLAN.md).
- Resolve type IDs at sheet-ingest time via
  `eve-data`'s `getTypeByName` (case-insensitive, published-wins).
  Store the resolved `type_id` on the resource row; leave it NULL
  when no mapping exists (the existing Sheet value renders as
  fallback).
- After sheet ingest, collect all distinct `type_id` values across
  resources and call `refreshPrices(db, typeIds)` once. Card
  render reads `getPrices(typeIds)`; show `pct5Buy` (Jita 5% buy)
  when present, fall back to the sheet value silently otherwise.
- Apply `pnpm db:migrate:prod` then `pnpm db:ingest:sde:prod`
  against Neon before deploying Session C — that's the moment
  `eve-data` finally needs to be populated remotely.

### Rough edges from Session B

- **Explicit `process.exit(0)` in the CLI.** The existing
  `ingest-sde.ts` relies on `.finally(() => client.end())` and
  apparently exits in practice, but the same pattern hung here —
  tsx's esbuild service plus the postgres pool kept the loop
  alive long after the work finished. Session B's CLI awaits
  `client.end()` and calls `process.exit(0)` to force a clean
  exit. Worth retroactively applying to `ingest-sde.ts` if it
  ever exhibits the same hang.
- **No prod migrate / refresh yet.** Schema is in `0003_*.sql` in
  the repo but Neon hasn't seen it. Session C (or any earlier
  prod task) needs `pnpm db:migrate:prod` first.
- **Jita mineral price inversion is real.** Not a code bug — the
  sanity trio shows `best_buy > best_sell` because of an outlier
  buy order. Session C should not assume "best buy < best sell"
  if it ever uses both columns together.

---

## Phase 2 — Session A (SDE plumbing): COMPLETE (2026-05-23)

The `src/data/eve-data/` slice exists and is ingested locally:

- **Schema:** three tables — `eve_categories`, `eve_groups`,
  `eve_types`. Primary keys are CCP's SDE IDs (not `serial`), FK
  chain types → groups → categories with `ON DELETE RESTRICT`. A
  functional `lower(name)` btree index on `eve_types` powers
  case-insensitive name lookup.
- **Ingest:** `pnpm db:ingest:sde` downloads the three Fuzzwork
  `latest/inv*.csv.bz2` dumps to `/tmp/lgi-sde/`, streams them
  through `unbzip2-stream` → `csv-parse` (RFC 4180, handles
  embedded newlines in descriptions) → batched 500-row inserts
  inside one transaction guarded by `TRUNCATE ... RESTART IDENTITY
  CASCADE`. Peak memory stays flat. Local run: 47 categories,
  1556 groups, 50,235 types in ~4.5s. Idempotent.
- **All types ingested.** Published/unpublished split observed at
  25,818 / 24,417. `published` boolean stored on every row;
  consumers filter if they care.
- **Query API:** `getType`, `getTypeByName`, `getTypesByIds`,
  `getTypesByNames`, `getGroup`, `getCategory`. All read-only;
  no Drizzle handles or schema re-exported from `queries.ts`.
  `getTypeByName` is case-insensitive and prefers published when
  names collide.
- **Migration:** `drizzle/0002_typical_lilandra.sql`. Applied
  locally; not yet applied to Neon prod (Session A goal was local
  verification; prod migrate is the next session's first action
  if it needs SDE data).
- **CLI entry:** `src/db/ingest-sde.ts` mirrors the
  dotenv-load → client → `try/finally client.end()` shape of the
  existing wormhole ingest. `--keep-cache` retains the `/tmp/`
  bz2s for repeat runs.
- **Decoupling verified.** Zero `@/features` imports under
  `src/data/`; zero `@/data/eve-data` imports under `src/features/`
  (becomes non-empty in Session C).

### Session B should start with

- ~~Build `src/data/market-prices/` against Fuzzwork's market
  API.~~ **Done — see the Session B block above.**
- Run `pnpm db:ingest:sde:prod` against Neon before Session C
  needs it. The migration file is in the repo, so
  `pnpm db:migrate:prod` then `pnpm db:ingest:sde:prod` is the
  sequence. (Session B added `0003_*.sql` on top; both
  migrations need to land before Session C deploys.)

### Rough edges from Session A

- **`@types/unbzip2-stream` is published but minimal** — the
  default-export shape was good enough to drop the `@ts-expect-error`.
  If the upstream types ever change, the cast in
  `src/data/eve-data/ingest.ts` may need revisiting.
- **`fetch().body` → `Readable.fromWeb()` requires a cast** in
  `src/data/eve-data/source.ts`. DOM `ReadableStream<Uint8Array>`
  vs Node `stream/web`'s narrower type. Idiomatic Node-on-Next.js
  friction; not eve-data-specific.
- **No prod ingest yet.** Schema is migrated locally only.

---

## Phase 1 — Wormhole Sites: COMPLETE (2026-05-22)

The live site at [lgi.tools](https://lgi.tools/) ships an end-to-end
wormhole site browser:

- **/** — landing page. Wordmark, tagline, single "Wormhole Sites" tile.
  Designed to grow as a tool grid.
- **/sites** — browser. Lists all sites grouped by type. URL-driven
  filters (`?type=` / `?class=`) drive a server navigation per click;
  no client JS. Every card collapses/expands inline via native
  `<details>`. Empty-state when filters return nothing.
- **/api/sites** + **/api/sites/[id]** — public JSON API with the same
  filter contract. Stable since Session 4.
- **/preview/cards** — design-system reference against `MOCK_SITES`.
  Kept as a visual regression page.

Data: 69 sites · 183 waves · 509 NPCs · 219 resources on Neon prod and
local Docker Postgres (port 5433). Counts by type: combat 24, gas 9,
ore 12, relic 12, data 12.

## Architecture invariants (still load-bearing)

- **Feature slice = `src/features/<name>/`.** Each feature has its own
  `schema.ts` (re-exported from `src/db/schema.ts`), `queries.ts`,
  `types.ts`, `components/`. Features never import from each other.
- **Data plumbing lives in `src/data/`, not `src/features/`.** Slices
  like `src/data/eve-data/` and `src/data/market-prices/` own ingest,
  schema, and a query API but no UI or end-user routes. Features in
  `src/features/` import from `src/data/`; data layers never import
  from features.
- **UI primitives in `src/components/ui/` are domain-agnostic.** They
  accept abstract `tone` props (`green`, `red`, …). The only file that
  knows "C5 is red" or "WEB is blue" is
  `src/features/wormhole-sites/components/wormhole-styles.ts`.
- **Enums driven from TS `as const` arrays** — Postgres types and TS
  types share one source of truth. `wormhole_class` uppercase `C1…C6`.
- **`Collapsible` is a pure `<details>`/`<summary>`** — no `'use client'`.
  Chevron rotation via a single CSS rule in `globals.css`.
- **Lazy DB client** (`src/db/index.ts` Proxy) — connection deferred to
  first query so `next build` survives empty `DATABASE_URL` from
  `vercel env pull`. Vercel injects the real URL at runtime.
- **Validation lives in route handlers, not queries.** Queries accept
  already-typed values.
- **Replace-children on ingest upsert** — `DELETE WHERE site_id=?` then
  re-insert. Converges to Sheet state without diffing.
- **Batched list queries.** `listSiteDetails()` returns N sites'
  full details in 4 round-trips (sites + waves + npcs + resources),
  not 1 + 3N.
- **Filter UI is URL-driven anchor links** — pure RSC, shareable URLs.

## Local dev boot order

```bash
docker compose up -d   # Postgres on :5433
pnpm db:migrate        # no-op unless new migrations
pnpm db:ingest         # refresh from Sheet (≈1s local)
pnpm dev               # http://localhost:3000
```

Sanity check: `curl http://localhost:3000/api/sites | jq length` → 69.

Scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:studio`,
`db:push`, `db:ingest`, `db:ingest:prod`, `db:migrate:prod` (the
`:prod` variants set `DOTENV_PATH=.env.production.local`).

## Known rough edges (carry forward)

- **Relic + data sites have no container resources in the DB.** Ingest
  parses combat/ore/gas resources but not hackable-can loot per
  signature. Affected cards show `+killing wave` (the blue-loot value)
  but no per-container breakdown and a `—` primary ISK. Either the
  Sheet doesn't expose can loot or `sheet-parser.ts` doesn't pull it
  — needs investigation.
- **`triggerLabel` rendering collapses every variant to "TRIGGER".** The
  Sheet has `Opt`, `DTA`, `1st Death Trigger`, `Opt?`, `Trigger on
  Attack`. Decide which to surface when a player asks.
- **Site-level EWAR row sums across all waves** at the card header.
  Per-wave EWAR rendering may read better — defer until real
  feedback.
- **Neut values in the sheet are negative integers** (cap drain in GJ,
  e.g. -18). `rrep` is a positive repair amount. Only `scram` and `web`
  are boolean counts (0/1). Keep this in mind if adding new EWAR display
  logic — the `!== 0` presence check handles all cases.
- **No `/sites/[id]` deep-link page.** Every card expands inline; a
  shareable per-site URL would need a new route.
- **Filter clicks are full server navigations** (~100–300ms on Neon).
  Fine for 69 cards; client-side filtering would be the upgrade if
  the dataset grows or the UX feels laggy.
- **No search-by-name, no sort options** beyond `source_tab, name`.
- **Single-tile landing page** — second tool fills the grid in
  naturally.

## Adding the next feature

1. New folder `src/features/<name>/` with `schema.ts`, `queries.ts`,
   `types.ts`, `components/`.
2. Re-export the schema from `src/db/schema.ts`.
3. Add API route(s) under `src/app/api/<name>/`.
4. Build composition components under
   `src/features/<name>/components/`, consuming UI primitives from
   `src/components/ui/` and adding a `<name>-styles.ts` mapping if
   tone bindings are needed.
5. Add a new tool tile to `/` landing page and (if applicable) a
   `/<name>` browser route mirroring the `/sites` pattern.
