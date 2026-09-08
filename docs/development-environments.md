# Development environments

`scripts/dev/bootstrap.sh` owns the shared local application bootstrap. The
Cursor VM adapter is `.cursor/environment.json`; saved environment bindings
and active Build selection remain platform settings.

## Operations

| Command | Contract |
| --- | --- |
| `bash scripts/dev/bootstrap.sh install` | Linux cloud setup: installs PostgreSQL 16 and CLIs, locked dependencies and Chromium; reconciles the database; proves Next JWKS and local Convex schema/auth setup; stops services it started before snapshotting. |
| `bash scripts/dev/bootstrap.sh reconcile` | Reconciles dependencies, migrations, SDE and Codegraph against an already running local database. Works with the existing macOS Docker database. |
| `bash scripts/dev/bootstrap.sh stack` | Linux task startup: owns the user PostgreSQL cluster and Next/Convex children, reconciles the actual task checkout, and stays in the foreground. |
| `bash scripts/dev/bootstrap.sh auth` | Requires live Next and anonymous Convex; installs validated local signing keys and the effective service secret. Failure returns nonzero. |
| `bash scripts/dev/bootstrap.sh readiness` | Checks the database baseline and repeats local auth reconciliation. The running stack's readiness message additionally proves its post-auth schema push. |

Keep local Docker and the existing `pnpm dev:all` workflow described in
[README](../README.md#local-development). `reconcile` operates on that same
local disposable database; it can re-ingest SDE when source or schema changes.
It does not install Linux packages or replace the local process manager.
Codegraph must already be on PATH for this command.

The package manager and framework versions come from `package.json` and
`pnpm-lock.yaml`. Cloud CLI versions live in `scripts/dev/clis.sh`. GitHub CLI
is required; Depot remains available while the CI provider decision is open.
No Origin runtime is required by these scripts.

## Local targets and ownership

Before provisioning, migration, ingestion or service startup, the bootstrap
checks all nonempty effective `LGI_DATABASE_URL`, `LGI_DATABASE_URL_UNPOOLED`,
`DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `DATABASE_MIGRATION_URL` values.
They must address user `lgi`, database `lgi_tools`, loopback port `5433`, with
no URL options. This covers the application's LGI override precedence and
Next's development dotenv precedence. Alternate `DOTENV_PATH` values fail.
Errors name the variable without exposing its value.

The application and migration subprocesses receive the same local URL and
`postgres-js` driver. Hosted Convex keys, deployment selectors and self-hosted
selectors are neutralized for these subprocesses. Anonymous local Convex owns
its generated deployment configuration; env operations select its generated
`anonymous:` deployment through `CONVEX_DEPLOYMENT`. The `--deployment local`
option is omitted because that CLI form selects a hosted deployment.

Cloud PostgreSQL uses `/usr/lib/postgresql/16/bin` and the user-owned
`~/.local/share/lgi-pgdata` directory (`LGI_PGDATA` may select another owned
cluster). Both `PG_VERSION` and SQL server version/data-directory identity
must match. Startup uses `pg_ctl` ownership checks; shutdown stops only a
cluster started by this invocation. PostgreSQL handles stale PID files.
An occupied port or another major version fails instead of adopting it.

## Checkout reconciliation

Dependency installation and matching Chromium download repeat when the
lockfile/package identity changes. Migrations run on every reconciliation.
SDE readiness requires the existing dogma, station and jump sentinels, market
prices, a nonempty SDE version, and a database-stored identity matching the
checked-out ingest/schema sources. Every reconciliation fetches the current
CCP version manifest, including warm starts. Matching source, stored version,
current CCP version and complete sentinels skip the heavy ingest. A changed
source, new CCP version or incomplete baseline forces the existing SDE
refresh pipeline and verifies its result before stamping readiness. An
unavailable manifest fails reconciliation clearly. Codegraph sync follows
the current checkout.

The explicit SDE `--check` used by `readiness` validates the previously
recorded local source/version/sentinel baseline without network access. It
does not establish current CCP freshness; install, reconcile and stack
startup always perform the manifest comparison.

## Service readiness

The foreground stack starts owned Next and anonymous Convex processes. It
waits for Next's JWKS and the local backend, validates public ES256 signing
keys, writes local auth environment values, then restarts its Convex child.
Convex's `--start` hook confirms a successful schema push with the reconciled
auth configuration. A missing secret, invalid JWKS, failed env write, failed
schema push, exited child or readiness timeout stops the stack with failure.
Logs remain in the foreground. Stopping the stack terminates its owned
process groups and cleans up temporary readiness state.

This proves bootstrap readiness. Full Atlas acceptance still requires an
authenticated local fixture operation and browser smoke; a listening port or
JWKS response alone does not prove those flows.

## Platform boundaries and acceptance

Cursor Builds prepare the default branch and persist disk state. The selected
feature checkout can differ from the Build source. The task terminal therefore
reconciles after checkout. Record active Build ID, repository binding, Build
source SHA and actual task SHA for cold, warm and changed-branch rehearsals.
A failed new Build can leave the old successful Build active; verify identity
before counting a start as migration evidence. See [Cursor Builds](https://cursor.com/docs/cloud-agent/builds).

Codex cloud setup/maintenance can call the shared operations, but setup
exports and background processes do not establish task runtime state. Secrets
are setup-only. A Codex adapter must explicitly start and supervise task
services and demonstrate its own networking/tool access; this change does
not claim Codex cloud parity. See [Codex cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment).

Use fresh platform-supported GitHub/Linear authentication for each rehearsal.
Keep credentials and personal browser state out of cached images. Only
locally generated development secrets and synthetic test fixtures belong in
this baseline. Record capability results and remaining gaps on LGI-120 and
LGI-121; activate saved environments and automations only through the migration
cutover work.
