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

## Session 3 — Starting Point

**Goal:** Add child tables to model site contents — the actual game data that makes each site meaningful.

**Domain split:**

- **Combat sites** → `waves` (wave number, trigger NPC name) → `npcs` (name, role `TRIGGER|NORMAL`, DPS, EHP, EWAR flags: web/scram/neut/rr)
- **Resource sites** → `ore_rocks` (asteroid type, quantity, volume, ISK value), `gas_clouds` (type, volume, ISK value, Sleeper spawn timer minutes), `relic_data_containers` (name, ISK value, site_type: relic|data)

**Key design question before writing schema:** Should the child tables use a shared `site_id` FK, or should combat/resource sites be separate parent tables? Recommendation: keep one `sites` parent table (already proven), add child tables with `site_id` FKs — avoids a structural rewrite.

**Suggested first step:** Sketch the `npcs` table (the richest content type) and get alignment before writing anything. Then generate + apply migration, seed a full C5 combat site with real NPC data.

**To boot local dev:**
```bash
docker compose up -d      # Start Postgres on :5433
pnpm dev                  # Next.js on :3000
```

**To verify everything is still connected:**
```bash
docker compose ps         # Postgres healthy
pnpm db:migrate           # "Migrations applied" (no-op if no new migrations)
curl localhost:3000        # HTTP 200
```
