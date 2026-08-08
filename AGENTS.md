# LGI.tools repository guide

LGI.tools is an incremental EVE Online multi-tool platform. Extend established
slices and shared infrastructure.

## Stack

Next.js 16.3.0 with Cache Components, React 19, strict TypeScript, Tailwind v4,
Drizzle ORM, Neon Postgres, Convex, Better Auth, Upstash Redis, Vercel, pnpm,
Vitest, and visx.

## Workflow

- **Ordinary work** begins from a direct request, never consults lifecycle
  state, and never runs the lifecycle resolver.
- **Planned lifecycle work** begins only through `start-session`; use its
  resolver-selected branch and handler.

## Subagents

Before writing or editing production or test code, launch `docs-researcher` for
every material external technology in the change (React, Next.js, Convex, Base
UI, React Flow, Vitest, and peers). Require a Documentation brief before
generation; do not implement from training memory. Skip the docs gate for docs,
SCRATCHPAD, policy, or other pure non-code edits.

Use `repo-mapper` for material relationship, consumer, dependency, or
blast-radius questions; it must use Codegraph CLI (`callers`, `callees`,
`impact`, `query`, plus `status`/`sync` if needed) and return a Repository map.

## Commands and definition of done

- Full local stack: `pnpm dev:all`
- Focused tests: pass the resolved path or Vitest filter to `pnpm test`
- Strict TypeScript check: `npx tsc --noEmit --incremental false`
- Sole definition of done: `pnpm verify`
- Testing principles: `docs/contributing/testing-principles.md`

Never run `pnpm build`, `next build`, `pnpm vercel-build`, or another
production-mode build locally or before merge. Only Vercel may run the
production build after the change reaches `main`.

Fallow is a gate. Do not add waivers or baseline entries to get around it. If
flagged, simplify the change or add meaningful behavioral coverage.
`pnpm fallow:health` is report only.

## Architecture and engineering

Production source belongs to the existing deny-by-default Fallow zones. Follow
the nearest scoped guide — `src/AGENTS.md` for application source and
`convex/AGENTS.md` for Convex. `.fallowrc.json` is the mechanical boundary
authority. Do not add cross-layer exceptions.

Always use existing primitives and configuration. Extract shared code only for
a real second consumer.

## Delivery and authorization

All changes ship through PRs to `main`, the only automatic deployment target.
When asked to wrap up or ship, invoke `close-out`, the sole
merge-to-production procedure.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

The Cloud Agent environment provisions the local stack itself; standard commands
still live in the README/`package.json`. Non-obvious caveats:

- **Postgres runs natively, not via Docker.** The VM has no Docker daemon or
  systemd, so `.cursor/install.sh` provisions a self-contained PostgreSQL 16
  cluster (owned by the agent user, `trust` auth) on `localhost:5433` — the same
  URL as `docker-compose.yml` — and `.cursor/start.sh` restarts it each boot.
  The migrated schema and the ingested EVE SDE are baked into the environment
  snapshot, so a normal boot needs no migration/ingest and no CCP network call.
- **Use `pnpm dev`, not `pnpm dev:all`.** `dev:all` runs `docker compose up -d`
  (no Docker here) and `convex dev` (needs a Convex cloud login that is not
  provisioned). The app degrades gracefully without Convex, so `pnpm dev` (Next
  on `:3000`) is the working local server.
- **`.env.local` is auto-generated** with dev-only session/crypto secrets and
  the local DB URLs. Any Cloud Agent Secret you upload is injected as a real env
  var and overrides the `.env.local` fallback at runtime — do not upload a
  production `DATABASE_URL`, or the app will talk to prod.
- **Real-Postgres `*.db.test.ts` suites need the `:5433` cluster** with
  migrations and SDE applied: they clone the live `public` schema, and some
  (wormhole codex / `sde_version`) fail rather than skip without SDE data. A
  cold/unreachable DB makes the harness skip those suites instead. `pnpm verify`
  is green in this environment.
- **`DATABASE_URL_UNPOOLED` must be non-empty.** The lock-holder scripts
  (`db:refresh-sde`, `db:refresh-prices`) resolve it with `??`, so the blank
  value shipped in `.env.example` does *not* fall back to `DATABASE_URL`; the
  install script points it at the same local cluster.
