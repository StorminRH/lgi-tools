# LGI.tools repository guide

LGI.tools is an incremental EVE Online multi-tool platform. Extend established
slices and shared infrastructure.

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
policy, or other pure non-code edits.

Use `repo-mapper` for material relationship, consumer, dependency, or
blast-radius questions; it must use Codegraph CLI (`callers`, `callees`,
`impact`, `query`, plus `status`/`sync` if needed) and return a Repository map.

## Commands and definition of done

Sole definition of done: `pnpm verify`.

Never run `pnpm build`, `next build`, `pnpm vercel-build`, or another
production-mode build locally or before merge. Only Vercel may run the
production build after the change reaches `main`.

Fallow is a gate. Do not add waivers or baseline entries to get around it. If
flagged, simplify the change or add meaningful behavioral coverage.
`pnpm fallow:health` is report only.

## Architecture and engineering

Neon is the source of truth for durable account, character, and ESI data.
Convex holds live projections plus the mapper collaborative-chain exception in
`docs/CONVEX.md`.

Production source belongs to the existing deny-by-default Fallow zones.
`.fallowrc.json` is the mechanical boundary authority. Do not add cross-layer
exceptions.

Always use existing primitives and configuration. Extract shared code only for
a real second consumer.

## Delivery and authorization

All changes ship through PRs to `main`, the only automatic deployment target.
When asked to wrap up or ship, invoke the `close-out` skill, the sole
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
  URL as `docker-compose.yml`. It runs in the foreground in the `postgres`
  terminal (see `.cursor/environment.json`) so it stays up for the session; a
  background daemon started in a `start` phase does not reliably survive boot.
  The migrated schema and the ingested EVE SDE are baked into the environment
  snapshot, so a normal boot needs no migration/ingest and no CCP network call.
- **Use `pnpm dev`, not `pnpm dev:all`.** `dev:all` runs `docker compose up -d`
  (no Docker here) and `convex dev` (needs a Convex cloud login that is not
  provisioned). The app degrades gracefully without Convex, so `pnpm dev` (Next
  on `:3000`) is the working local server — the `next-dev` terminal waits for
  Postgres and runs it for you.
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
