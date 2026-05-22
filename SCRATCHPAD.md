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

## Session 2 — Starting Point

**Start with:** Define the first feature. Based on `CLAUDE.md`, the platform is for Eve Online players with "wave card" patterns suggesting wormhole data is the first feature.

**Suggested first step:** Decide the first feature (e.g., wormhole reference data) and define its schema in `src/features/<name>/schema.ts`, re-export from `src/db/schema.ts`, then run `pnpm db:generate && pnpm db:migrate`.

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
