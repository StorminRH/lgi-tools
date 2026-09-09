# Cloud Agent

Read when running or setting up the Cursor Cloud Agent Linux VM defined by
`.cursor/environment.json`. Its install/start scripts provision the VM stack;
local Cursor and Codex sessions use `README.md#local-development` instead.
The shared bootstrap contract is in
[development environments](../docs/development-environments.md). These notes describe the VM environment,
not permissions or credentials granted to other hosts.

## Postgres

No Docker, no systemd. `.cursor/install.sh` provisions PostgreSQL 16 on
`localhost:5433`, owned by the agent user, `trust` auth, same URL as
`docker-compose.yml`. The foreground `development` terminal
(`.cursor/environment.json`) owns PostgreSQL, Next and Convex through
`.cursor/dev.sh` and `scripts/dev/bootstrap.sh stack`. Startup uses `pg_ctl`
ownership checks and stops only the cluster started by that invocation. A
background daemon started in a `start` phase does not reliably survive boot.

The migrated schema and ingested EVE SDE are baked into the snapshot after
the install adapter verifies Next/Convex readiness and stops its services.
The task terminal reconciles the actual checkout after a Build restore:
migrations run each time, and SDE reconciliation checks the current CCP
manifest, source identity and database sentinels. A matching baseline skips
the heavy ingest; changed or incomplete data requires refresh. An unavailable
manifest fails reconciliation.

## Next and Convex

Use the `development` terminal, not `pnpm dev:all`. The terminal starts
`pnpm dev` under the shared stack owner; `dev:all` runs `docker compose up -d`.

Convex is an owned child of the same terminal. The shared bootstrap runs
`CONVEX_AGENT_MODE=anonymous pnpm exec convex dev` on `:3210`. Do not copy a
laptop `local:` pair, a hosted `*.convex.cloud` URL, or `CONVEX_DEPLOY_KEY`.
Fixture probes call `convex run` against the selected `local:` or `anonymous:`
deployment and refuse a hosted URL.

After Next is up, the shared stack reconciles `AUTH_ISSUER_URL`, `SITE_URL`,
`AUTH_JWKS` (from `/api/auth/jwks`), and a VM-generated `CONVEX_SERVICE_SECRET`
onto the local deployment, then confirms the schema push with that auth
configuration. Atlas `atlas-*` probes need both Next and Convex. `pnpm verify`
does not require those browser services. Missing readiness, an exited child
or a timeout stops the stack; a listening port alone is not Atlas acceptance.
`.cursor/start.sh` prepares CLI paths and GitHub git authentication; it does
not run a background auth reconciler.

## Env and secrets

`.env.local` is generated with dev-only session and crypto secrets and the
local DB URLs. A Cloud Agent Secret is injected as a real env var and overrides
the `.env.local` fallback at runtime. A production `DATABASE_URL` makes the
app talk to prod. The shared bootstrap rejects non-local effective database
URLs before provisioning, migration, ingestion or startup, and removes hosted
Convex selectors from its application and migration subprocesses.

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

Playwright Chromium is installed by `.cursor/install.sh` from the selected
lockfile. Use `http://localhost:3000`. Playwright fixtures now seed test-only
auth and own principals, maps and cleanup; the standalone `pnpm e2e:seed`
command is retired. Do not upload auth storage or cookie jars. Follow
[the UX verification workspace](../docs/ux-check/README.md) for lane selection
and prerequisites. Production lanes own their server: stop the development
stack first, then keep the required local PostgreSQL/Convex backends ready
with the same settings used by the production build.

## Tooling

Use the Cursor skill and agent paths listed in AGENTS.md. Codex paths are
separate harness adaptations; they do not provision this VM.

`.cursor/clis.sh` (install + start) puts Codegraph (`@colbymchenry/codegraph@1.5.0`),
Depot, Vercel, and Neon on PATH through `scripts/dev/clis.sh`. GitHub CLI
`gh` is required; the bootstrap installs it when absent. No Origin runtime
is required. Depot remains installed pending its authorized retirement.
`convex` and `fallow` stay `pnpm exec`. `.codegraph/` is snapshotted.
`repo-mapper` can run `codegraph sync` after material source edits.
Codegraph does not need a token. Depot, Vercel, and Neon use Cloud Agent
Secrets when a command needs them.

Before migration, the Cloud Agent Origin token was observed to allow create, comment, and watch
but refuse `origin pr merge` and `origin ruleset list`. Default
merge, `--merge`, `--squash`, `--auto`, and `--branch` all returned
"not scoped for this operation"; `origin api` merge calls returned 401.
The PR could still be mergeable. This historical observation does not
establish the GitHub token's scope. Check actual `gh`, GitHub git and Linear
access on the current VM; integrations and shell credentials are separate
capabilities. If an authorized GitHub merge returns a scope error, report
`BLOCKED` and leave the PR open for the operator to merge or upgrade the token.
A VM result does not establish a local Cursor or Codex token's scope.

GitHub Actions runs the selected `test.yml` workflow. Wait for the current
PR checks with `gh pr checks <N> --watch`; require successful `verify`,
`build` and `e2e` after reviews are idle and the local suite is green.
`--head` and `--base` are PR create flags.

Saved environment repository bindings, active Build IDs, Build source SHAs,
secrets/network settings and automation bindings are external to
`.cursor/environment.json`. Verify them in Cursor when migrating to GitHub.
An existing successful Build is not evidence that a replacement Build succeeded.
