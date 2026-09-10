# Cloud Agent

Read when running or setting up the Cursor Cloud Agent Linux VM defined by
`.cursor/environment.json`. Its install/start scripts provision the VM stack;
local Cursor and Codex sessions do not use these scripts.
These notes describe the VM environment, not permissions or credentials
granted to other hosts.

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

Start Next through the VM's `next-dev` terminal. Use the VM's existing
database and Convex terminals; the combined local-development setup
depends on Docker, which is unavailable here.

Convex is the sibling `convex-dev` terminal. `.cursor/convex.sh` starts
anonymous Convex on `:3210`. Selectors are
`anonymous:anonymous-agent` or unset/empty (so dotenv can choose). `start.sh`
and `dev.sh` refuse a hosted, `local:`, or non-loopback Convex URL before Next
starts. An empty inherited `CONVEX_DEPLOYMENT` is unset.

AUTH reconcile is the `configure-convex-auth` terminal
(`.cursor/configure-convex-auth.sh`). It waits for Next `/api/auth/jwks`
(parsed nonempty signing keys) and Convex `:3210`, then sets `AUTH_ISSUER_URL`,
`SITE_URL`, `AUTH_JWKS`, and `CONVEX_SERVICE_SECRET` on the anonymous
deployment. Readiness is `/tmp/lgi-convex-auth.status`: `0` means reconcile
succeeded. `start.sh` pins local DB / anonymous Convex and configures
GitHub authentication; it does not own AUTH reconcile.

The verification suite, public e2e, and synthetic-auth smoke do not require
Convex AUTH reconcile.

## Env and secrets

`.env.local` is generated with dev-only session and crypto secrets and the
local DB URLs. A Cloud Agent Secret is injected as a real env var and overrides
the `.env.local` fallback at runtime. A production `DATABASE_URL` makes the
app talk to prod.

`DATABASE_URL_UNPOOLED` must be set. The SDE and price refresh scripts
resolve it with `??`, so the blank value in `.env.example`
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

Playwright Chromium is installed by `.cursor/install.sh`. Browse the app at
`http://localhost:3000` after the `next-dev` terminal is ready. Before
authenticated browser tests, seed the test account and its browser storage
state on this VM using the repository's e2e setup. Do not upload
`auth-storage.json` or cookie jars.

## Tooling

`.cursor/clis.sh` makes Codegraph, Vercel, and Neon available during install
and startup. Use the repository's installed Convex and Fallow tooling.

The Codegraph index is included in the snapshot. Installation refreshes it
or creates it when missing. Codegraph does not need a token. Vercel and
Neon use Cloud Agent Secrets for authenticated operations.

## Delivering changes

1. Confirm that the checkout's GitHub remote points to the intended
   repository. Remote names can differ between environments; identify it
   by its URL rather than assuming a particular name.
2. Confirm that GitHub access works on this VM. Startup uses the injected
   GitHub token to configure authentication. If an operation fails, report
   the actual failure from this environment.
3. Push the work to its GitHub branch and open or update the pull request
   against `development`. Follow the user's requested scope for reviews
   and merging.
4. Start the GitHub Actions Verify workflow for the PR branch when
   verification is required. It does not start automatically on a push
   or pull request.
5. Wait for verification, the production build, and end-to-end tests to
   finish. Confirm that their results apply to the PR's current commit.
   If the branch changes, obtain fresh results for the updated commit.
6. Report the PR and verification results. Merge only when authorized;
   after merging, confirm the target branch contains the change.
