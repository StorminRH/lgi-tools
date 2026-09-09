#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.cursor/lib.sh"

lgi_pin_local_db_env
lgi_pin_anonymous_convex_env

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

echo "postgres ready; starting next dev server"
lgi_eve_runtime_secret_presence
exec pnpm dev
