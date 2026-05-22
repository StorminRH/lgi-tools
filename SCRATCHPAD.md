# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

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
- **EntityRow name truncation** when EWAR chips compete for width.
  Cosmetic; sometimes shows `Awakened Sent…` instead of `Sentinel`.
- **Site-level EWAR row sums across all waves** at the card header.
  Per-wave EWAR rendering may read better — defer until real
  feedback.
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
