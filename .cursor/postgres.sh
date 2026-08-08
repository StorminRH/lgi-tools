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

# A postmaster already owns THIS data dir (e.g. started elsewhere)? Just follow
# along so this terminal stays attached without starting a second postmaster on
# the same cluster. Gate on the data directory, not the port: pg_isready only
# proves something answers on :5433 (which could be another cluster entirely,
# or miss a postmaster still in crash recovery).
if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "postgres already running for $PGDATA"
  exec tail -n +1 -F /tmp/lgi-pg.log 2>/dev/null || exec sleep infinity
fi

# Hand the terminal to postgres. Do NOT delete postmaster.pid here: postgres
# itself removes a pid file it can prove stale and refuses only when a live
# postmaster may still own the data dir — exactly the case where starting
# another one would corrupt it.
echo "starting postgres (foreground) on :5433"
exec "$PGBIN/postgres" -D "$PGDATA"
