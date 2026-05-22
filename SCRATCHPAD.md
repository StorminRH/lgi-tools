# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Session 1 — Project Skeleton (2026-05-22)

### What was built

| File / Dir | What it is |
|---|---|
| `src/app/` | Default Next.js 16 App Router scaffold (page, layout, globals.css) |
| `src/db/index.ts` | Drizzle client — exports `db` wrapping a `postgres-js` connection |
| `src/db/schema.ts` | Empty placeholder; features add their own tables and re-export here |
| `src/db/migrate.ts` | CLI migration runner — `pnpm db:migrate` calls this |
| `drizzle.config.ts` | Drizzle Kit config — reads `DATABASE_URL` from `.env.local` |
| `drizzle/meta/` | Empty migration journal (no tables yet) |
| `docker-compose.yml` | `postgres:16-alpine` on host port **5433** (5432 is taken by `wormhole_db`) |
| `.env.local` | Local dev secrets (gitignored) — points at Docker Postgres |
| `.env.example` | Committed template showing required env keys |
| `.env.production.local` | Pulled from Vercel (gitignored) — prod values are encrypted server-side |
| `CLAUDE.md` | Project principles + `@AGENTS.md` for Next.js 16 agent guidance |
| `AGENTS.md` | Created by `create-next-app` — tells AI to read bundled Next.js docs |

### Decisions made

- **Next.js 16.2.6** with Turbopack, App Router, TypeScript, Tailwind v4, ESLint 9, `src/` layout
- **pnpm** as the package manager
- **Drizzle ORM + postgres-js** — lightweight, TypeScript-first, pairs naturally with Neon serverless
- **Docker Postgres on 5433** — host port shifted from default 5432 because `wormhole_db` (another project) already holds that port
- **Local = Docker Postgres, Prod = Neon** — clean two-env split; Vercel injects Neon `DATABASE_URL` automatically on deploy; Vercel encrypted env vars won't show in `vercel env pull` by design
- **Neon database**: created via Vercel Storage marketplace, named `LGI-Tools-DB`, wired to Production + Preview environments
- **GitHub**: private repo at [github.com/StorminRH/lgi-tools](https://github.com/StorminRH/lgi-tools) on branch `main`
- **Vercel**: project `lgi-tools` under `stormins-projects` scope, GitHub connected (auto-deploy on push to `main`)
- Local folder stays as `LGI Tools/` (space tolerated by all tooling); package name is `lgi-tools`

### Open questions / deferred

- No tables in the schema yet — Session 2 defines the first feature schema
- No auth layer yet (will need one once there are user-specific features)
- `wormhole_db` on port 5432 — presumably another EVE project; coordinate if both run at the same time

### npm scripts added

```
pnpm dev           — Next.js dev server (Turbopack, port 3000)
pnpm build         — Production build
pnpm db:generate   — Generate Drizzle migration files from schema
pnpm db:migrate    — Apply pending migrations to the DB
pnpm db:studio     — Open Drizzle Studio (visual DB browser)
pnpm db:push       — Push schema directly to DB (no migration file, use for rapid prototyping)
```

---

## Session 2 — Wormhole Sites Schema (2026-05-22)

### What was built

| File / Dir | What it is |
|---|---|
| `src/features/wormhole-sites/schema.ts` | First feature schema — `SITE_TYPES` and `WORMHOLE_CLASSES` constants, two `pgEnum` types, and the `sites` table |
| `src/db/schema.ts` | Stub replaced with `export * from '../features/wormhole-sites/schema'` — the contract for adding features |
| `drizzle/0000_peaceful_stick.sql` | Generated migration: `CREATE TYPE site_type`, `CREATE TYPE wormhole_class`, `CREATE TABLE sites` |
| `drizzle/meta/_journal.json` | Journal updated with migration entry |

**`sites` table columns:** `id` (serial PK), `name` (text), `site_type` (enum), `wormhole_class` (enum), `description` (nullable text), `created_at` (timestamp default now)

### Decisions made

- **One table for now** — `sites` holds shared metadata; type-specific child tables (NPC waves, rocks, clouds, containers) deferred to Session 3
- **Enums driven from TS constants** — `SITE_TYPES` and `WORMHOLE_CLASSES` are `as const` arrays; `pgEnum` consumes them directly. One source of truth for both Postgres and TypeScript types — config-over-repetition per `CLAUDE.md`
- **`wormhole_class` values are uppercase** (`'C1'…'C6'`) to match EVE convention
- **Migration is safe to re-run** — Drizzle tracks state in `drizzle.__drizzle_migrations`; second run exits cleanly with "Migrations applied" (no-op)
- **Feature folder pattern validated** — `src/features/<name>/schema.ts` → re-exported from `src/db/schema.ts` → picked up by `drizzle.config.ts` — the pattern works end-to-end

### Verified

- `\dt` shows `sites` table
- `\d sites` confirms all 6 columns with correct types
- `\dT+ site_type` and `\dT+ wormhole_class` show correct enum values
- `pnpm db:migrate` run twice — second run is a no-op
- `INSERT INTO sites ... VALUES ('Forgotten Frontier Recursive Depot', 'combat', 'C5')` — row written and read back successfully
- `pnpm tsc --noEmit` — clean compile

### Open questions / deferred

- No child tables yet — site contents (NPC waves, rocks, gas clouds, relics) modelled in Session 3
- No `updated_at`, unique constraints, soft delete, or slugs — all deferred
- No seed data / data loading script yet — that's Session 3 or later

---

## Session 3 — Sheet Ingestion (2026-05-22)

### What was built

| File / Dir | What it is |
|---|---|
| `src/features/wormhole-sites/schema.ts` | Extended — added `waves`, `npcs`, `site_resources` tables; new `sites` columns (`source_tab`, `signature_label`, `blue_loot_isk`, `isk_per_ehp`, `resource_value_isk`, `updated_at`); `wormhole_class` now nullable; unique `(source_tab, name)` natural key; exports `SIGNATURE_LABELS`, `TRIGGER_LABELS`, `SLEEPER_CLASS_CODES` as const arrays for downstream UI |
| `src/features/wormhole-sites/sheet-source.ts` | Canonical 8-tab listing (C1–C6 + Gas + Ore) with gids, labels, and resource kind; CSV URL builder; signature-label → site_type mapping |
| `src/features/wormhole-sites/sheet-parser.ts` | Pure CSV→normalized JSON. RFC 4180 parser handles quoted fields with embedded commas/newlines. Recognizes combat blocks (Wave N + Trigger NPCs) and resource blocks (Defenders + resource table). Block-end heuristic: 2 blank rows OR a row that looks like a new site header |
| `src/features/wormhole-sites/ingest.ts` | Orchestrator — fetches all 8 tabs in parallel, parses, runs the entire upsert + child-replace + prune in one transaction |
| `src/db/ingest.ts` | CLI entry. `DOTENV_PATH` env var picks the env file (defaults to `.env.local`); `--no-prune` disables the cleanup phase |
| `drizzle/0001_majestic_slyde.sql` | Generated migration. Prepended `DELETE FROM "sites";` to wipe the Session-2 hand-typed row before adding NOT NULL columns |
| `package.json` | Added `db:ingest`, `db:migrate:prod`, `db:ingest:prod` scripts (the `:prod` variants set `DOTENV_PATH=.env.production.local`) |
| `.env.local`, `.env.example` | Added `SHEET_PUB_KEY` (the published `2PACX-...` token from the Sheet URL) |

### Decisions made

- **Sheet-faithful schema.** Trigger labels (`Trigger`, `Opt`, `DTA`, `1st Death Trigger`, `Opt?`, `Trigger on Attack`) and sleeper class codes (`F`/`C`/`B`/`T`) stored as **free text** rather than enums. The Sheet has a long tail of one-off labels; locking to an enum would force a migration for every typo. TS `as const` arrays still give compile-time autocomplete for UI code per CLAUDE.md "config-over-repetition".
- **`wormhole_class` is now nullable.** Gas/Ore tabs cover all classes in one sheet — the Sheet doesn't tag each gas/ore site with a class. NULL is the honest answer; populating it would mean smuggling outside game knowledge.
- **Replace-children, not diff-by-natural-key.** On each upsert we `DELETE waves WHERE site_id=?` + `DELETE site_resources WHERE site_id=?` then re-insert. Cascade FKs drop NPCs. Simpler than per-row diff and guaranteed to converge to Sheet state.
- **Prune scoped to fetched tabs.** Site rows whose `(source_tab, name)` no longer matches the parsed Sheet get deleted — but only within `source_tab IN (Class 1, …, Ore Signatures)`. A partial outage can't wipe unrelated rows.
- **CSV via published `pub?gid=…&output=csv` endpoint.** No Google API key, no auth. The Sheet must remain published as "anyone with the link".
- **`SHEET_PUB_KEY` lives in `.env.local`**, not hardcoded in source — keeps the URL one config edit away if the Sheet ever gets re-published.

### Verified

- `pnpm db:migrate` clean on local Postgres (Docker :5433).
- `pnpm db:ingest` produces: `sites=69, waves=183, npcs=509, resources=219, removed=0`.
- Type breakdown: `combat=24, relic=12, data=12, ore=12, gas=9` (matches independent Python analyzer of raw CSVs).
- Round-trip spot-check on **Forgotten Perimeter Coronation Platform** (C1, Relic, $12.8M loot): all 3 waves with correct NPC counts, classes, trigger labels, and DPS reproduce the raw CSV byte-for-byte.
- Top gas sites by `resource_value_isk` rank correctly (Vital Core → Instrumental Core → Vast Frontier).
- **Idempotency**: re-running ingest produces identical counts; no duplicates, no churn.
- **Neon**: schema + data mirrored via inline `DATABASE_URL=… pnpm db:migrate` + `pnpm db:ingest`. Counts and spot-check match local exactly.
- `pnpm tsc --noEmit` — clean compile.

### Open questions / deferred

- **Reference tabs not yet ingested**: sleeper bestiary (`gid=360740101`), sleeper TypeIDs (`590981029`), gas/ore prices (`16967167`/`716251505`/`421910724`), drifter missile data (`345568467`), escalation rules (`1160985461` Upgraded Avenger, `1813193533` Drifter). These are orthogonal to "sites" and may live as separate tables when needed.
- **Gas/Ore wormhole class**: Sheet doesn't tag — NULL today. A later session might add a static mapping table (`name → C1|C2|…`) curated outside the Sheet, but only if a tool actually needs that filter.
- **Vercel-encrypted env vars**: `vercel env pull` returns empty placeholders for DATABASE_URL et al. Neon push currently requires the URL be set inline. Long-term, consider a `vercel env pull --environment=development` workflow or a dedicated Neon secret in `.env.local`.
- **Trigger-label normalization**: `Opt` vs `Opt?` and `Trigger` vs `Trigger on Attack` are stored raw. UI may want to fold them or expose both — defer until there's a UI consumer.

### npm scripts added/changed

```
pnpm db:ingest          — Fetch Sheet → upsert local DB (default .env.local)
pnpm db:ingest --no-prune  — Skip the prune phase (won't delete missing rows)
pnpm db:migrate:prod    — Run migrate with DOTENV_PATH=.env.production.local
pnpm db:ingest:prod     — Run ingest with DOTENV_PATH=.env.production.local
```

---

## Session 4 — Starting Point

**Goal:** Surface the ingested data through the app. First feature using these tables: a wave-card UI on the homepage or a dedicated `/sites` route.

**Per CLAUDE.md "reusable primitives over one-off components":** the wave card is a **collapsible group-of-entities** component fed wormhole data today. Design the primitive so it can later render mining waves, escalation waves, or any other "group with rows and totals".

**Suggested first step:** Read `node_modules/next/dist/docs/` for the Next.js 16 App Router patterns (per AGENTS.md), then build a server-rendered `/sites` page that lists all 69 sites and a `/sites/[id]` detail view that renders a wave card per `waves` row with the NPC table inside.

**To boot local dev:**
```bash
docker compose up -d      # Postgres on :5433
pnpm db:migrate           # No-op unless new migration files
pnpm db:ingest            # Refresh from the Sheet (≈1s local, ≈30s Neon)
pnpm dev                  # Next.js on :3000
```

**Quick "is anything broken" check:**
```bash
docker compose ps                                    # Postgres healthy
PGPASSWORD=lgi psql -h localhost -p 5433 -U lgi -d lgi_tools -c "SELECT count(*) FROM sites;"  # expect 69
```
