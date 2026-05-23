# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Phase 2 — Session C (live prices on site cards): COMPLETE (2026-05-23)

`src/features/wormhole-sites/` now ships live Jita 5%-percentile buy prices
end-to-end with silent fallback to the Sheet value. Phase 1's UI is
pixel-identical.

- **Schema:** added nullable `type_id INTEGER` column to `site_resources`.
  No FK to `eve_types` — preserves the data-slice decoupling that
  `market_prices` also follows. Migration `0004_blushing_tomorrow_man.sql`.
  Applied locally; **not yet applied to Neon prod**.
- **Strict alias map** (`src/features/wormhole-sites/resource-aliases.ts`):
  50 hand-authored entries covering every distinct `resource_name` in the
  current DB. **Every ore, ice, and gas alias points to the Compressed
  SDE variant** — what wormhole haulers actually sell in Jita. Two Sheet
  typos are encoded verbatim with the correct SDE name as the value
  (`luminous kermite` → `Compressed Luminous Kernite`,
  `vivid hemorite` → `Compressed Vivid Hemorphite`). Missing names
  resolve to typeId = null and continue rendering the Sheet value.
- **Ingest changes:** `runIngest` now resolves resource names to type IDs
  via `getTypesByNames` **before** opening the transaction (no read locks
  held during eve-data reads). After the transaction commits, distinct
  type IDs are fed into `refreshPrices(db, typeIds)` — wrapped in
  try/catch so a Fuzzwork outage logs and continues. The summary
  surfaces `resourcesWithTypeId`, `distinctTypeIds`,
  `pricesFetched`/`Written`/`Failed` so a bad ingest is visible.
  Current local run: 219/219 resources mapped, 50 distinct typeIds,
  50/50 prices fetched.
- **Live overlay** (`src/features/wormhole-sites/live-prices.ts`):
  `overlayLivePrices(sites)` adds `liveIsk` + `effectiveIsk` to each
  resource and replaces site-level `resourceValueIsk` with
  `sum(effectiveIsk)`. **Formula: `liveIsk = round(units × pct5Buy)`** —
  the Sheet stores `units` as raw EVE unit counts, and compressed-market
  prices are per-unit (1 compressed unit = 1 raw unit equivalent for
  ore/ice/gas), so no volume conversion is needed. Spot-checked against
  Arkonor, Dark Glitter, Fullerite-C320 — all scale linearly with units.
- **Type changes** (`src/features/wormhole-sites/types.ts`):
  `SiteResource` gained `typeId`, `liveIsk`, `effectiveIsk`. Queries
  hydrate `liveIsk: null`, `effectiveIsk: totalIsk` on raw DB reads so
  the overlay is optional — anything that doesn't call it (mock data,
  future consumers) still renders sheet values cleanly.
- **UI edits** (only the absolute minimum):
  - `ResourceRow.tsx`: switched `formatIsk(resource.totalIsk)` →
    `formatIsk(resource.effectiveIsk)` in all three branches.
  - `SiteCard.tsx`: footer total reduces over `r.effectiveIsk`.
  - No layout/typography/class changes anywhere.
- **Route + API cut-over:** `/sites/page.tsx` and `/api/sites/[id]/route.ts`
  pipe the result through `overlayLivePrices`. `/api/sites` (list-only,
  no resources) is untouched. The temporary `/preview/sites-live` route
  used during Checkpoint 1 has been deleted.
- **CLI fix:** applied the explicit `await client.end(); process.exit(0)`
  pattern (lifted from `refresh-prices.ts`) to `src/db/ingest.ts` —
  adding a Fuzzwork network call could resurface the tsx+postgres hang
  documented in Session B.
- **Fallback verified:** `DELETE FROM market_prices` + reload reverts
  every card to its Sheet value exactly. No errors thrown. Sheet
  `totalIsk` is preserved on every resource row in the DB.
- **`pnpm build` + `pnpm lint`** both green.

### Session D should start with

- Read PHASE_2_PLAN.md Session D. The task is the 24-hour-cache refresh
  button that wraps `refreshPrices`. Pick a button location on `/sites`
  (footer / freshness chip / `/admin` route — agent's call) and a clear
  cached-vs-refreshed status message.
- **Production deploy sequence** (do this BEFORE merging Session C to
  main, or as the first action of Session D):
  1. `pnpm db:migrate:prod` — applies `0002`, `0003`, `0004` to Neon
     (none have been applied to prod yet).
  2. `pnpm db:ingest:sde:prod` — populates `eve_types` on Neon.
  3. `pnpm db:ingest:prod` — re-ingests sites against the now-populated
     SDE, resolves type IDs, refreshes Fuzzwork prices.
  4. Merge / push code to deploy via Vercel.
- The cache-check needed by Session D is already telegraphed in the
  schema: `MAX(updated_at)` on `market_prices`. The current
  ingest-time refresh resets that timestamp on every `pnpm db:ingest` —
  acceptable, since an operator running ingest implies they want fresh
  data.

### Rough edges from Session C

- **Sheet `resource_name` typos are now in the alias map.** If the Sheet
  ever fixes the typos (`Luminous Kermite` → `Luminous Kernite`,
  `Vivid Hemorite` → `Vivid Hemorphite`), the broken keys silently
  start resolving to NULL. Watch the ingest summary's
  `resourcesWithoutTypeId` count — non-zero means a new name appeared
  or an old key broke.
- **`/api/sites` (list) still returns Sheet values for `resourceValueIsk`**
  because it never fetches resources. Only `/api/sites/[id]` (detail)
  applies the overlay. Documented but mildly inconsistent — flag if a
  consumer ever needs aggregate live values without per-row resources.
- **No badge / freshness indicator on the card.** Per PHASE_2_PLAN.md
  Session C "Out of scope" — the live prices are silent. Session D
  introduces user-facing freshness.

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

- ~~Wire wormhole sites to live prices.~~ **Done — see the Session C
  block at the top of this file.**

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
