# Cloud Agent

Read when running or setting up a Cloud Agent. This environment provisions the
stack. CLI commands live in AGENTS.md Tools. The caveats below are the ones
those files do not state.

## Postgres

No Docker, no systemd. `.cursor/install.sh` provisions PostgreSQL 16 on
`localhost:5433`, owned by the agent user, `trust` auth, same URL as
`docker-compose.yml`. It runs in the foreground in the `postgres` terminal
(`.cursor/environment.json`). A background daemon started in a `start` phase
does not reliably survive boot.

The migrated schema and ingested EVE SDE are baked into the snapshot. A normal
boot needs no migration, no ingest, and no CCP network call.

## Next and Convex

Use `pnpm dev`, not `pnpm dev:all`. `dev:all` runs `docker compose up -d`.

Convex is the sibling `convex-dev` terminal. `.cursor/convex.sh` runs
`CONVEX_AGENT_MODE=anonymous pnpm exec convex dev` on `:3210`. Do not copy a
laptop `local:` pair, a hosted `*.convex.cloud` URL, or `CONVEX_DEPLOY_KEY`.
Fixture probes call `convex run` against the selected `local:` or `anonymous:`
deployment and refuse a hosted URL.

After Next is up, `.cursor/start.sh` reconciles `AUTH_ISSUER_URL`, `SITE_URL`,
`AUTH_JWKS` (from `/api/auth/jwks`), and a VM-generated `CONVEX_SERVICE_SECRET`
onto the local deployment. Atlas `atlas-*` probes need both Next and Convex
terminals. `pnpm verify`, public e2e, and synthetic-auth smoke do not.

## Env and secrets

`.env.local` is generated with dev-only session and crypto secrets and the
local DB URLs. A Cloud Agent Secret is injected as a real env var and overrides
the `.env.local` fallback at runtime. A production `DATABASE_URL` makes the
app talk to prod.

`DATABASE_URL_UNPOOLED` must be set. The lock-holder scripts (`db:refresh-sde`,
`db:refresh-prices`) resolve it with `??`, so the blank value in `.env.example`
does not fall back to `DATABASE_URL`. The install script points it at the same
local cluster.

Never upload production `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`DATABASE_MIGRATION_URL`, a hosted Convex URL or deployment,
`CONVEX_DEPLOY_KEY`, or a `~/.convex` access token. Preview log probes may use
`VERCEL_AUTOMATION_BYPASS_SECRET` only.

## Tests

`*.db.test.ts` suites need the `:5433` cluster with migrations and SDE
applied. They clone the live `public` schema. Wormhole codex and `sde_version`
fail rather than skip without SDE data. A cold or unreachable database makes
the harness skip those suites. `pnpm verify` is green in this environment.

Playwright Chromium is installed by `.cursor/install.sh`. Use
`http://localhost:3000` (the `next-dev` terminal). Seed auth with
`pnpm e2e:seed` on this VM. Do not upload `auth-storage.json` or cookie jars.

## Tooling

Project skills live in `.cursor/skills/`. Review skills here include
`thermos`, `thermo-nuclear-review`, and
`thermo-nuclear-code-quality-review`. Custom subagents live in `.cursor/agents/`.

`.cursor/clis.sh` (install + start) puts Codegraph (`@colbymchenry/codegraph@1.5.0`),
Depot, Vercel, and Neon on PATH. `origin` is the Cloud Agent runtime.
`convex` and `fallow` stay `pnpm exec`. `.codegraph/` is snapshotted.
`repo-mapper` can run `codegraph sync` after material source edits.
Codegraph does not need a token. Depot, Vercel, and Neon use Cloud Agent
Secrets when a command needs them.

This Cloud Agent Origin token can create, comment, and watch. It is
not scoped for `origin pr merge` or `origin ruleset list`. Default
merge, `--merge`, `--squash`, `--auto`, and `--branch` all return
"not scoped for this operation". `origin api` merge calls 401. The
PR can still be mergeable. Close-out runs `origin pr merge <N>` and
returns `BLOCKED` on that error. The operator merges or upgrades the
token.

Origin Checks wait is `origin pr checks <N> --watch` in the foreground
until it returns. After `test-runner` pass `<N>` or `--branch <head>`.
`--head` and `--base` are create flags. A subscription or `--json`
snapshot is extra.
