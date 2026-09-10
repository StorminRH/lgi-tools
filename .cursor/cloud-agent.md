# Cloud Agent

Read when running or setting up the Cursor Cloud Agent Linux VM defined by
`.cursor/environment.json`. Its install/start scripts provision the VM stack;
local Cursor and Codex sessions use `README.md#local-development` instead.
CLI commands live in AGENTS.md Tools. These notes describe the VM environment,
not permissions or credentials granted to other hosts.

## Postgres

No Docker, no systemd. `.cursor/install.sh` provisions PostgreSQL 16 on
`localhost:5433`, owned by the agent user, `trust` auth, same URL as
`docker-compose.yml`. It runs in the foreground in the `postgres` terminal
(`.cursor/environment.json`). A background daemon started in a `start` phase
does not reliably survive boot.

The migrated schema and ingested EVE SDE are baked into the snapshot. A normal
boot needs no migration, no ingest, and no CCP network call. Install prints the
SDE census (including `market_prices` and `sites`) while the install-owned
postmaster is still up, then stops that cluster so the `postgres` terminal owns
the session.

## Next and Convex

Use `pnpm dev`, not `pnpm dev:all`. `dev:all` runs `docker compose up -d`.

Convex is the sibling `convex-dev` terminal. `.cursor/convex.sh` runs
`CONVEX_AGENT_MODE=anonymous pnpm exec convex dev` on `:3210`. Selectors are
`anonymous:anonymous-agent` or unset/empty (so dotenv can choose). `start.sh`
and `dev.sh` refuse a hosted, `local:`, or non-loopback Convex URL before Next
starts. An empty inherited `CONVEX_DEPLOYMENT` is unset.

AUTH reconcile is the `configure-convex-auth` terminal
(`.cursor/configure-convex-auth.sh`). It waits for Next `/api/auth/jwks`
(parsed nonempty signing keys) and Convex `:3210`, then sets `AUTH_ISSUER_URL`,
`SITE_URL`, `AUTH_JWKS`, and `CONVEX_SERVICE_SECRET` on the anonymous
deployment. Readiness is `/tmp/lgi-convex-auth.status`: `0` means reconcile
succeeded. `start.sh` pins local DB / anonymous Convex and sets up `gh`; it
does not own AUTH reconcile.

Atlas `atlas-*` probes need Next, Convex, and a `0` auth status. `pnpm verify`,
public e2e, and synthetic-auth smoke do not.

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
the harness skip those suites. Report which suites actually ran; a skipped
DB suite is not evidence for its behavior.

Playwright Chromium is installed by `.cursor/install.sh`. Use
`http://localhost:3000` (the `next-dev` terminal). Seed auth with
`pnpm e2e:seed` on this VM. Do not upload `auth-storage.json` or cookie jars.

## Tooling

Use the Cursor skill and agent paths listed in AGENTS.md. Codex paths are
separate harness adaptations; they do not provision this VM.

`.cursor/clis.sh` (install + start) puts Codegraph (`@colbymchenry/codegraph@1.5.0`),
Depot, Vercel, and Neon on PATH. `origin` is the Cloud Agent runtime.
`convex` and `fallow` stay `pnpm exec`. `.codegraph/` is snapshotted.
`repo-mapper` can run `codegraph sync` after material source edits.
Codegraph does not need a token. Depot, Vercel, and Neon use Cloud Agent
Secrets when a command needs them.

The Cloud Agent Origin token was observed to allow create, comment, and watch
but refuse `origin pr merge` and `origin ruleset list`. Default
merge, `--merge`, `--squash`, `--auto`, and `--branch` all returned
"not scoped for this operation"; `origin api` merge calls returned 401.
The PR can still be mergeable. If the authorized merge returns that scope
error, report `BLOCKED` and leave the Origin PR open for the operator to merge
or upgrade the token. Check the actual command result on the current host;
this observation does not establish a local Cursor or Codex token's scope.

Depot wait is `depot ci dispatch` on the head branch, then
`depot ci status <run-id>` until it returns. Dispatch once reviews
are idle and the local suite is green. `--head` and `--base` are
create flags. `origin pr checks` stays empty on dispatch.
