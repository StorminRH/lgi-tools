#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.cursor/lib.sh"

lgi_pin_local_db_env
lgi_pin_anonymous_convex_env
lgi_require_anonymous_convex_file .env.local

PGBIN="$(lgi_pg16_bin)"

echo "waiting for postgres on :5433 ..."
for _ in $(seq 1 60); do
  if "$PGBIN/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! "$PGBIN/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools >/dev/null 2>&1; then
  echo "ERROR: postgres did not become ready on :5433" >&2
  exit 1
fi

env_val() { grep -E "^${1}=" .env.local 2>/dev/null | head -1 | cut -d= -f2-; }
export AUTH_ISSUER_URL="${AUTH_ISSUER_URL:-http://localhost:3000}"
export SITE_URL="${SITE_URL:-http://localhost:3000}"
export CONVEX_SERVICE_SECRET="${CONVEX_SERVICE_SECRET:-$(env_val CONVEX_SERVICE_SECRET)}"
if [ -f /tmp/lgi-auth-jwks-uri ]; then
  export AUTH_JWKS
  AUTH_JWKS="$(cat /tmp/lgi-auth-jwks-uri)"
else
  export AUTH_JWKS="${AUTH_JWKS:-$LGI_PLACEHOLDER_JWKS}"
fi

echo "postgres ready; starting anonymous convex dev on :3210"
exec pnpm exec convex dev
