# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

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

- Build `src/data/market-prices/` against Fuzzwork's market API.
  Read PHASE_2_PLAN.md "Session B" + the Decisions-already-made
  block. The session's first consumer of `eve-data` is a Tritanium
  / Pyerite / Mexallon (typeIDs 34/35/36) sanity fetch — the
  query API is ready.
- Run `pnpm db:ingest:sde:prod` against Neon before Session C
  needs it (no urgency until then). The migration file is in the
  repo, so `pnpm db:migrate:prod` then `pnpm db:ingest:sde:prod`
  is the sequence.

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
