#!/usr/bin/env bash
# Waits for the local Postgres (the `postgres` terminal) to accept connections,
# then runs the Next.js dev server in the foreground on http://localhost:3000.
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

echo "postgres ready; starting next dev server"
exec pnpm dev
