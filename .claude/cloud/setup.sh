#!/usr/bin/env bash
# One-time provisioning for the Claude Code cloud environment. The
# environment's setup script runs this; the snapshot taken afterwards keeps
# everything outside the checkout (Postgres cluster with SDE, Convex local
# backend, CLIs, Playwright Chromium, generated .env.local). Idempotent: the
# SessionStart hook reruns it when a session starts without that state.
#
# Runs from any working directory. The snapshot is only kept when this
# finishes within about five minutes, so independent installs run in
# parallel and every phase is timed in $LGI_SETUP_LOG.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.claude/cloud/lib.sh"
# shellcheck source=clis.sh
source "$REPO_ROOT/.claude/cloud/clis.sh"

mkdir -p "$LGI_STATE_DIR"
exec > >(tee "$LGI_SETUP_LOG") 2>&1
setup_phase=start
phase() {
  setup_phase="$1"
  echo "[setup +${SECONDS}s] $1"
}

PGBIN=""
PGDATA="$LGI_PGDATA"
export PGDATA
started_pg=0
bg_pids=()
on_exit() {
  local rc=$?
  local pid
  for pid in "${bg_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  [ -z "$PGBIN" ] || lgi_stop_owned_postgres "$PGBIN" "$PGDATA" "$started_pg"
  lgi_stop_orphan_convex_backend
  lgi_write_setup_status "$rc" "$setup_phase" "$SECONDS"
  echo "[setup +${SECONDS}s] exit $rc at phase $setup_phase"
}
trap on_exit EXIT
trap 'exit 143' TERM INT

# Wait for a background step and replay its log if it failed.
wait_step() {
  local pid="$1" name="$2"
  if ! wait "$pid"; then
    echo "ERROR: $name failed:" >&2
    tail -n 40 "$LGI_STATE_DIR/$name.log" >&2
    return 1
  fi
}

phase "install: postgres 16, pinned CLIs, pnpm dependencies"
lgi_ensure_pg16 >"$LGI_STATE_DIR/apt.log" 2>&1 &
apt_pid=$!
lgi_install_clis >"$LGI_STATE_DIR/clis.log" 2>&1 &
clis_pid=$!
bg_pids=("$apt_pid" "$clis_pid")
lgi_pin_local_db_env
lgi_pin_anonymous_convex_env
lgi_install_deps

# The image ships an older Playwright Chromium and skips browser downloads by
# default; install the revision this repo's Playwright pins while the
# database provisions.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 pnpm exec playwright install chromium \
  >"$LGI_STATE_DIR/playwright.log" 2>&1 &
playwright_pid=$!
bg_pids+=("$playwright_pid")

wait_step "$apt_pid" apt
PGBIN="$(lgi_pg16_bin)"

phase "postgres: cluster and database"
mkdir -p "$PGDATA"
[ "$(id -u)" != 0 ] || chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  lgi_pg_server "$PGBIN/initdb" -D "$PGDATA" -U lgi --auth=trust --encoding=UTF8 >/tmp/lgi-initdb.log 2>&1
fi
if [ -f "$PGDATA/PG_VERSION" ] && [ "$(cat "$PGDATA/PG_VERSION")" != 16 ]; then
  echo "ERROR: Postgres data dir is version $(cat "$PGDATA/PG_VERSION"); this environment pins 16" >&2
  exit 1
fi
lgi_pg_server tee "$PGDATA/postgresql.auto.conf" >/dev/null <<'EOF'
port = 5433
listen_addresses = 'localhost'
unix_socket_directories = '/tmp'
EOF
lgi_pg_server tee "$PGDATA/pg_hba.conf" >/dev/null <<'EOF'
local   all   all                trust
host    all   all   127.0.0.1/32 trust
host    all   all   ::1/128      trust
EOF
if ! lgi_pg_server "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  lgi_pg_server "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LGI_PG_LOG" -w start
  started_pg=1
fi
"$PGBIN/psql" -h localhost -p 5433 -U lgi -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='lgi_tools'" | grep -q 1 \
  || "$PGBIN/createdb" -h localhost -p 5433 -U lgi lgi_tools

phase "env: .env.local"
lgi_restore_env_local .env.local
[ -f .env.local ] || cp .env.example .env.local
lgi_strip_empty_env_local_key .env.local CONVEX_DEPLOYMENT
lgi_strip_empty_env_local_key .env.local NEXT_PUBLIC_CONVEX_URL
set_var() {
  local k="$1" v="$2"
  if lgi_forbidden_env_local_key "$k"; then
    echo "ERROR: refusing to write $k into .env.local" >&2
    return 1
  fi
  if grep -qE "^${k}=" .env.local; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env.local
  else
    printf '%s=%s\n' "$k" "$v" >> .env.local
  fi
}
val() { grep -E "^${1}=" .env.local | head -1 | cut -d= -f2-; }
ensure_secret() { [ -n "$(val "$1")" ] || set_var "$1" "$(openssl rand -base64 32)"; }

set_var LOCAL_DB_DRIVER postgres-js
set_var DATABASE_URL "$LGI_LOCAL_DB_URL"
set_var DATABASE_URL_UNPOOLED "$LGI_LOCAL_DB_URL"
ensure_secret SESSION_SECRET
ensure_secret BETTER_AUTH_SECRET
ensure_secret EVE_TOKEN_ENCRYPTION_KEY
ensure_secret ESI_SNAPSHOT_ENCRYPTION_KEY
[ -n "$(val CRON_SECRET)" ] || set_var CRON_SECRET "$(openssl rand -hex 32)"
[ -n "$(val CONVEX_SERVICE_SECRET)" ] || set_var CONVEX_SERVICE_SECRET "$(openssl rand -hex 32)"
set_var BETTER_AUTH_URL http://localhost:3000
set_var CONVEX_AGENT_MODE anonymous

lgi_require_anonymous_convex_file .env.local

phase "postgres: migrations"
lgi_run_local_db pnpm db:migrate

phase "postgres: SDE"
lgi_ensure_sde_ready || exit 1

phase "convex: anonymous local backend"
# The first `--once` creates the deployment and may fail until AUTH_* exist on it.
export AUTH_ISSUER_URL=http://localhost:3000
export SITE_URL=http://localhost:3000
export AUTH_JWKS="$LGI_PLACEHOLDER_JWKS"
export CONVEX_SERVICE_SECRET
CONVEX_SERVICE_SECRET="$(val CONVEX_SERVICE_SECRET)"
# Through the egress proxy the CLI sometimes crashes on socket end after its
# download, before it records the deployment; retry once it is cleaned up.
for attempt in 1 2 3; do
  lgi_stop_orphan_convex_backend
  pnpm exec convex dev --once || true
  [ -z "$(val CONVEX_DEPLOYMENT)" ] || break
  echo "convex dev --once did not configure the deployment (attempt $attempt)" >&2
done
lgi_stop_orphan_convex_backend
[ -n "$(val CONVEX_DEPLOYMENT)" ] || { echo "ERROR: convex dev --once never configured the deployment" >&2; exit 1; }
pnpm exec convex env set AUTH_ISSUER_URL http://localhost:3000
pnpm exec convex env set SITE_URL http://localhost:3000
printf '%s' "$AUTH_JWKS" | pnpm exec convex env set AUTH_JWKS
printf '%s' "$CONVEX_SERVICE_SECRET" | pnpm exec convex env set CONVEX_SERVICE_SECRET
pnpm exec convex dev --once

phase "finish: CLIs and Playwright"
wait_step "$clis_pid" clis
wait_step "$playwright_pid" playwright
bg_pids=()

lgi_require_anonymous_convex_file .env.local
lgi_save_env_local .env.local
touch "$LGI_PROVISIONED_MARKER"
phase done

echo "setup.sh complete: postgres 16 :5433 provisioned; SDE census ready."
lgi_sde_report "$LGI_LOCAL_DB_URL"
if [ "$started_pg" = 1 ]; then
  lgi_stop_owned_postgres "$PGBIN" "$PGDATA" 1
  started_pg=0
fi
