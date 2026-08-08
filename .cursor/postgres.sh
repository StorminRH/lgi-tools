#!/usr/bin/env bash
# Runs the local PostgreSQL 16 cluster (provisioned by install.sh) in the
# FOREGROUND so this tmux-backed terminal owns it for the agent's lifetime.
# A background daemon started in the `start` phase does not reliably survive
# into the running session, so Postgres lives here instead.
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
PGDATA="$HOME/.local/share/lgi-pgdata"
export PGDATA

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "ERROR: postgres data dir missing ($PGDATA); run .cursor/install.sh first" >&2
  exit 1
fi

# Already accepting connections (e.g. started elsewhere)? Just follow along so
# this terminal stays attached without a second postmaster fighting for :5433.
if "$PGBIN/pg_isready" -h localhost -p 5433 -U lgi >/dev/null 2>&1; then
  echo "postgres already accepting connections on :5433"
  exec tail -n +1 -F /tmp/lgi-pg.log 2>/dev/null || exec sleep infinity
fi

# Clear any stale pid left by a snapshot, then hand the terminal to postgres.
rm -f "$PGDATA/postmaster.pid"
echo "starting postgres (foreground) on :5433"
exec "$PGBIN/postgres" -D "$PGDATA"
