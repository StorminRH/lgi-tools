# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Phase 2: COMPLETE (2026-05-23)

Phase 2 shipped the shared data plumbing every future tool will lean on:

- **`src/data/eve-data/`** — Eve SDE ingested from Fuzzwork (47 categories,
  1556 groups, 50,235 types). Public read API: `getType`, `getTypeByName`,
  `getTypesByIds`, `getTypesByNames`, `getGroup`, `getCategory`.
- **`src/data/market-prices/`** — Jita 5%-percentile prices keyed by
  type ID. One-function source swap (Fuzzwork → ESI is one file).
  Public read API: `getPrices`.
- **Wormhole site live prices.** Sheet `resource_name`s map to compressed
  SDE variants via a strict hand-authored alias dict
  (`src/features/wormhole-sites/resource-aliases.ts`). Each
  `siteResources` row carries the resolved `typeId`; missing entries
  fall back to the Sheet value silently. `overlayLivePrices` adds
  `liveIsk`/`effectiveIsk` per row at render time.
- **Refresh button + 24h cache.** Footer on `/sites`. The cache layer
  (`src/data/market-prices/cache.ts`) reads `MAX(updated_at)` and
  guards both the POST `/api/market-prices/refresh` endpoint AND the
  bare `pnpm db:refresh-prices` CLI. `--force` flag bypasses; explicit
  IDs (`pnpm db:refresh-prices 34,35,36`) bypass too for ad-hoc
  Fuzzwork checks. Cache source-of-truth is `market_prices.type_id`
  itself — the wormhole-sites ingest seeds it; the cache slice has
  zero imports from feature slices.

## Phase 2.5: IN PROGRESS

Cleanup pass on Phase 2's known rough edges. Session-by-session
status:

- **E** ✅ shipped 2026-05-23. Relic/data cards render killing-wave
  ISK as the primary value (treated as combat-style sites). Single
  derived flag (`isWaveDriven = isCombat || isHackSite`) in
  `SiteCard.tsx` substitutes for `isCombat` in four places.
- **F** locked — render `triggerLabel` verbatim, no shorthand map.
- **G** locked — rename list endpoint's `resourceValueIsk` to
  `sheetResourceValueIsk` to make the Sheet source explicit.
- **H** dropped from 2.5 — replaced by Phase 2.6 (see below).
- **I** locked — copy the `await client.end(); process.exit(0)`
  pattern from `refresh-prices.ts` into `ingest-sde.ts`.
- **J, K** deferred to Phase 2.9 (visual overhaul). Sortable
  list and search-by-name UX should be designed inside the
  overall layout pass, not retrofitted before it.
- **L** locked — three pieces: `/sites/[id]` route, "← Return to
  full list" link on that page, silent URL sync on card clicks via
  `history.replaceState`. Intentionally breaks the "Collapsible is
  a pure `<details>` — no 'use client'" invariant; that was a Phase-1
  taste choice, not a project-wide rule. Update this list when L
  ships.

## Phase 2.6: NEW — Decouple from the Sheet

Surfaced mid-Phase-2.5: the Sheet was always meant to be a one-time
seed, not the long-term source of truth. Today `pnpm db:ingest`
still treats it as authoritative and would silently wipe any future
in-DB edits. Phase 2.6 is a single-session phase that:

- Audits every Sheet tab (including the ones Phase 1 skipped) to
  make sure nothing useful is lost.
- Schema-extends + seeds anything we want to keep into the DB.
- Retires routine `pnpm db:ingest` (renamed + guarded, or removed).
- Fixes the two known Sheet typos in the DB directly and removes
  those entries from the alias map.

See [PHASE_2.6_PLAN.md](PHASE_2.6_PLAN.md).

## Open phases

- [PHASE_2.5_PLAN.md](PHASE_2.5_PLAN.md) — remaining rough-edges work
  (F, G, I, L).
- [PHASE_2.6_PLAN.md](PHASE_2.6_PLAN.md) — Sheet decoupling.
- [PHASE_2.9_PLAN.md](PHASE_2.9_PLAN.md) — pre-Phase-3 visual overhaul
  (now also includes the deferred J and K from 2.5).
- The Phase 2 historical brief is archived under
  `LGI Tools Archive/PHASE_2_PLAN.md` (outside this repo).

---

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
  types share one source of truth.
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
- **Cache logic lives in the slice that owns the data, not the route.**
  Both the API endpoint and the CLI go through the same cache wrapper
  so a hand-crafted POST can't bypass the 24h limiter.

## Local dev boot order

```bash
docker compose up -d   # Postgres on :5433
pnpm db:migrate        # no-op unless new migrations
pnpm db:ingest         # refresh sites from Sheet (≈1s local)
pnpm dev               # http://localhost:3000
```

Sanity check: `curl http://localhost:3000/api/sites | jq length` → 69.

Scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:studio`,
`db:push`, `db:ingest`, `db:ingest:prod`, `db:migrate:prod`,
`db:ingest:sde`, `db:ingest:sde:prod`, `db:refresh-prices`,
`db:refresh-prices:prod` (the `:prod` variants set
`DOTENV_PATH=.env.production.local`).

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
