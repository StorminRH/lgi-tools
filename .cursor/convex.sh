#!/usr/bin/env bash
# Waits for the local Postgres terminal, then runs an anonymous local Convex
# backend on :3210. Do not use a hosted Convex URL or CONVEX_DEPLOY_KEY here —
# mapper fixture probes hardcode `--deployment local`, and Convex HTTP actions
# must reach this VM's Next at http://localhost:3000.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

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

export CONVEX_AGENT_MODE=anonymous
unset CONVEX_DEPLOY_KEY || true

# auth.config.ts refuses a push when these are unset. Placeholders let the
# first push succeed; configure-convex-auth.sh replaces AUTH_JWKS with the
# live Better Auth keyset once Next is serving /api/auth/jwks.
env_val() { grep -E "^${1}=" .env.local 2>/dev/null | head -1 | cut -d= -f2-; }
export AUTH_ISSUER_URL="${AUTH_ISSUER_URL:-http://localhost:3000}"
export SITE_URL="${SITE_URL:-http://localhost:3000}"
export CONVEX_SERVICE_SECRET="${CONVEX_SERVICE_SECRET:-$(env_val CONVEX_SERVICE_SECRET)}"
if [ -f /tmp/lgi-auth-jwks-uri ]; then
  export AUTH_JWKS
  AUTH_JWKS="$(cat /tmp/lgi-auth-jwks-uri)"
else
  export AUTH_JWKS="${AUTH_JWKS:-data:text/plain;charset=utf-8;base64,e30=}"
fi

echo "postgres ready; starting anonymous convex dev on :3210"
exec pnpm exec convex dev
