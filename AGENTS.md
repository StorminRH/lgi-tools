# LGI.tools repository guide

LGI.tools is an incremental EVE Online multi-tool platform. Extend established
slices and shared infrastructure.

## Workflow

- **Ordinary work** begins from a direct request, never consults lifecycle
  state, and never runs the lifecycle resolver.
- **Planned lifecycle work** begins only through `start-session`; use its
  resolver-selected branch and handler.

## Subagents

Prefer a subagent when the work isolates well. If a listed seat fits, use
it; other subagents are fine when they help.

Before writing or editing production or test code, launch `docs-researcher` for
every material external technology in the change (React, Next.js, Convex, Base
UI, React Flow, Vitest, and peers). Require a Documentation brief before
generation; do not implement from training memory.

Use `repo-mapper` for material relationship, consumer, dependency, or
blast-radius questions; it must use Codegraph CLI (`callers`, `callees`,
`impact`, `query`, plus `status`/`sync` if needed) and return a Repository map.

Use `gate-runner` for caller-supplied focused tests and `pnpm verify` when a
Gate result packet is needed. Do not use it to fix failures.

Launch those seats by name and omit Task `model` so the agent file pin
applies. Do not pass `inherit` or a slug; those override the pin.

## Commands and definition of done

Sole definition of done: `pnpm verify`.

Never run `pnpm build`, `next build`, `pnpm vercel-build`, or another
production-mode build locally or before merge. Only Vercel may run the
production build after the change reaches `main`.

Fallow is a whole-repo gate. Do not add waivers or baseline entries to get
around it. If flagged, simplify the change or add meaningful behavioral
coverage.

## Architecture and engineering

Neon is the source of truth for durable account, character, and ESI data.
Convex holds live projections plus the mapper collaborative-chain exception in
`docs/CONVEX.md`.

Production source belongs to the existing deny-by-default Fallow zones.
`.fallowrc.json` is the mechanical boundary authority. Do not add cross-layer
exceptions.

Always use existing primitives and configuration. Extract shared code only for
a real second consumer.

## Atlas wormhole language

When discussing Atlas connections, use the glossary at the top of
`src/data/maps/connection-door-types.ts`. Talk about a system (and its class
when it matters), the wormholes in that system, outgoing named holes vs
incoming K162s. Example: jump a P060, land in a C1, the way back is the K162.
Do not call systems origin or far side. Stored `from`/`to` are document ends,
not incoming vs outgoing.

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
  (no Docker here). Convex is a sibling terminal: `.cursor/convex.sh` runs
  `CONVEX_AGENT_MODE=anonymous pnpm exec convex dev` on `:3210`. Do not copy a
  laptop `local:` pair, a hosted `*.convex.cloud` URL, or `CONVEX_DEPLOY_KEY`.
  Fixture probes call `convex run` against the selected `local:` or
  `anonymous:` deployment and refuse a hosted URL.
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
- **Project skills live in `.cursor/skills/`.** Official review skills from
  Thermos and Cursor Team Kit live here too: `thermos`,
  `thermo-nuclear-review`, `thermo-nuclear-code-quality-review`, and
  `deslop`. Thermos owns the quality-review skill; do not keep a Team Kit
  duplicate.
- **Custom subagents live in `.cursor/agents/`.**
- **Playwright Chromium is installed by `.cursor/install.sh`.** Use
  `http://localhost:3000` (the `next-dev` terminal). Seed auth with
  `pnpm e2e:seed` on this VM; do not upload `auth-storage.json` or cookie jars.
- **Anonymous Convex lives on `:3210`.** After Next is up, `.cursor/start.sh`
  reconciles `AUTH_ISSUER_URL`, `SITE_URL`, `AUTH_JWKS` (from
  `/api/auth/jwks`), and a VM-generated `CONVEX_SERVICE_SECRET` onto the local
  deployment. Atlas `atlas-*` probes need both terminals; `pnpm verify`,
  public e2e, and synthetic-auth smoke do not.
- **Codegraph CLI** (`@colbymchenry/codegraph@1.5.0`) is installed globally
  and `.codegraph/` is snapshotted. `repo-mapper` can run `codegraph sync`
  after material source edits; a token is not required.
- **Do not upload** production `DATABASE_URL` / `DATABASE_URL_UNPOOLED` /
  `DATABASE_MIGRATION_URL`, hosted Convex URL/deployment, `CONVEX_DEPLOY_KEY`,
  or a `~/.convex` access token. Preview log probes may use
  `VERCEL_AUTOMATION_BYPASS_SECRET` only.
