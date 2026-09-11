#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.cursor/lib.sh"

lgi_ensure_pg16
PGBIN="$(lgi_pg16_bin)"
PGDATA="$HOME/.local/share/lgi-pgdata"
export PGDATA
lgi_pin_local_db_env
lgi_pin_anonymous_convex_env
# Snapshot user-level Cursor files from the VM overlay. start.sh recopies
# from the checkout on every boot so later commits win without a rebuild.
lgi_install_vm_home "$REPO_ROOT/.cursor/vm-home"

started_pg=0
trap 'lgi_stop_owned_postgres "$PGBIN" "$PGDATA" "$started_pg"' EXIT

pnpm install --frozen-lockfile

# Playwright Chromium for `pnpm test:e2e` on this VM. Chrome is
# already present for computer-use screenshots; this is the Playwright cache
# the test runner actually launches. Idempotent: skips downloads when current.
pnpm exec playwright install --with-deps chromium

LGI_CLI_REFRESH=1
# shellcheck source=clis.sh
source "$REPO_ROOT/.cursor/clis.sh"
export CODEGRAPH_TELEMETRY=0
if [ -d .codegraph ]; then
  codegraph sync
else
  codegraph init
fi


mkdir -p "$PGDATA"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$PGDATA" -U lgi --auth=trust --encoding=UTF8 >/tmp/lgi-initdb.log 2>&1
fi
if [ -f "$PGDATA/PG_VERSION" ] && [ "$(cat "$PGDATA/PG_VERSION")" != 16 ]; then
  echo "ERROR: Postgres data dir is version $(cat "$PGDATA/PG_VERSION"); this environment pins 16" >&2
  exit 1
fi
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

lgi_run_local_db pnpm db:migrate

if ! lgi_sde_ready "$LGI_LOCAL_DB_URL"; then
  lgi_run_local_db pnpm db:refresh-sde --force
fi
if ! lgi_sde_ready "$LGI_LOCAL_DB_URL"; then
  echo "ERROR: SDE census failed after refresh. Report:" >&2
  lgi_sde_report "$LGI_LOCAL_DB_URL" >&2 || true
  exit 1
fi

# The first `--once` creates the deployment and may fail until AUTH_* exist on it.
export CONVEX_AGENT_MODE=anonymous
unset CONVEX_DEPLOY_KEY || true
export AUTH_ISSUER_URL=http://localhost:3000
export SITE_URL=http://localhost:3000
export AUTH_JWKS="$LGI_PLACEHOLDER_JWKS"
export CONVEX_SERVICE_SECRET
CONVEX_SERVICE_SECRET="$(val CONVEX_SERVICE_SECRET)"
pnpm exec convex dev --once || true
pnpm exec convex env set AUTH_ISSUER_URL http://localhost:3000
pnpm exec convex env set SITE_URL http://localhost:3000
printf '%s' "$AUTH_JWKS" | pnpm exec convex env set AUTH_JWKS
printf '%s' "$CONVEX_SERVICE_SECRET" | pnpm exec convex env set CONVEX_SERVICE_SECRET
pnpm exec convex dev --once

echo "install.sh complete: postgres 16 :5433 provisioned; SDE census ready."
lgi_sde_report "$LGI_LOCAL_DB_URL"
if [ "$started_pg" = 1 ]; then
  lgi_stop_owned_postgres "$PGBIN" "$PGDATA" 1
  started_pg=0
fi
