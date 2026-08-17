#!/usr/bin/env bash
# Cloud Agent install phase for LGI.tools.
#
# Idempotent, source-derived bootstrap that runs after checkout. It refreshes
# node dependencies, provisions a self-contained local PostgreSQL 16 cluster on
# :5433 (matching docker-compose.yml / the request-path DATABASE_URL), writes a
# dev .env.local, applies migrations, and seeds the EVE SDE the first time.
#
# No long-running process is started here; postgres is a transient the snapshot
# preserves on disk and the `postgres` terminal in `.cursor/environment.json`
# re-launches on every boot.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DB_URL="postgres://lgi:lgi@localhost:5433/lgi_tools"
PGDATA="$HOME/.local/share/lgi-pgdata"
export PGDATA

# --- System dependency: PostgreSQL 16. Present on the environment snapshot;
# this guard only fires on a cold base image. ---
if ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
  sudo apt-get update -q
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-16 postgresql-client-16
fi
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

# Any failure below must not leave a postmaster THIS script started (and its
# live postmaster.pid) behind for the snapshot — but a cluster the `postgres`
# terminal already owns is not ours to stop, so the trap is flag-gated.
started_pg=0
trap '[ "$started_pg" = 1 ] && "$PGBIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 || true' EXIT

# --- Node dependencies (pinned pnpm + frozen lockfile) ---
pnpm install --frozen-lockfile

# Playwright Chromium for `pnpm test:e2e` / ux-check on this VM. Chrome is
# already present for computer-use screenshots; this is the Playwright cache
# the test runner actually launches. Idempotent: skips downloads when current.
pnpm exec playwright install --with-deps chromium

# --- Local Postgres cluster (owned by the agent user; no Docker/systemd) ---
mkdir -p "$PGDATA"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$PGDATA" -U lgi --auth=trust --encoding=UTF8 >/tmp/lgi-initdb.log 2>&1
fi
# Dev-only: listen on 5433 and trust localhost so the fixed dev URL connects.
cat > "$PGDATA/postgresql.auto.conf" <<'EOF'
port = 5433
listen_addresses = 'localhost'
unix_socket_directories = '/tmp'
EOF
cat > "$PGDATA/pg_hba.conf" <<'EOF'
local   all   all                trust
host    all   all   127.0.0.1/32 trust
host    all   all   ::1/128      trust
EOF
if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/lgi-pg.log -w start
  started_pg=1
fi
"$PGBIN/psql" -h localhost -p 5433 -U lgi -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='lgi_tools'" | grep -q 1 \
  || "$PGBIN/createdb" -h localhost -p 5433 -U lgi lgi_tools

# --- Dev .env.local (gitignored; dev-only values). Uploaded Secrets are
# injected as real env vars and take precedence over these at runtime. ---
[ -f .env.local ] || cp .env.example .env.local
set_var() {
  local k="$1" v="$2"
  if grep -qE "^${k}=" .env.local; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env.local
  else
    printf '%s=%s\n' "$k" "$v" >> .env.local
  fi
}
val() { grep -E "^${1}=" .env.local | head -1 | cut -d= -f2-; }
ensure_secret() { [ -n "$(val "$1")" ] || set_var "$1" "$(openssl rand -base64 32)"; }

set_var LOCAL_DB_DRIVER postgres-js
set_var DATABASE_URL "$DB_URL"
# resolveLockConnectionUrl() uses ?? so an empty value would NOT fall back to
# DATABASE_URL; point the direct/unpooled var at the same local cluster.
set_var DATABASE_URL_UNPOOLED "$DB_URL"
ensure_secret SESSION_SECRET
ensure_secret BETTER_AUTH_SECRET
ensure_secret EVE_TOKEN_ENCRYPTION_KEY
ensure_secret ESI_SNAPSHOT_ENCRYPTION_KEY
[ -n "$(val CRON_SECRET)" ] || set_var CRON_SECRET "$(openssl rand -hex 32)"

# --- Schema + seed data ---
# Pin every URL the node scripts resolve (migrate-url.ts reads
# DATABASE_MIGRATION_URL ?? DATABASE_URL; resolveLockConnectionUrl reads
# DATABASE_URL_UNPOOLED ?? DATABASE_URL) to the local cluster on the command
# itself. Injected Cloud Agent Secrets override .env.local, so without these
# pins an uploaded production URL would receive the migrations and the
# TRUNCATE-and-reingest below.
pin=(DATABASE_URL="$DB_URL" DATABASE_URL_UNPOOLED="$DB_URL" DATABASE_MIGRATION_URL="$DB_URL")
env "${pin[@]}" pnpm db:migrate

# EVE SDE ingest is heavy and pulls from CCP. Only run it when market data is
# absent (a truly cold database); the snapshot already carries it, so normal
# boots skip the network entirely.
priced="$("$PGBIN/psql" "$DB_URL" -tAc 'SELECT count(*) FROM market_prices' 2>/dev/null || echo 0)"
if [ "${priced:-0}" -lt 1 ]; then
  env "${pin[@]}" pnpm db:refresh-sde --force
fi

# Re-read while the cluster is still up so the closing line reports what is
# actually on disk rather than asserting success.
priced="$("$PGBIN/psql" "$DB_URL" -tAc 'SELECT count(*) FROM market_prices' 2>/dev/null || echo 0)"

# Shut the cluster down cleanly so the data dir (and any snapshot taken of it)
# carries no stale postmaster.pid (the EXIT trap covers failure paths too).
# A cluster the `postgres` terminal already owned stays up — it is not ours.
if [ "$started_pg" = 1 ]; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 || true
  started_pg=0
fi

echo "install.sh complete: postgres :5433 provisioned; market_prices rows: ${priced:-0}."
