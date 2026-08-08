#!/usr/bin/env bash
# Cloud Agent start phase for LGI.tools.
#
# Per-boot reconciliation: bring the local PostgreSQL 16 cluster (provisioned by
# install.sh, preserved in the snapshot) back up on :5433. Idempotent and safe
# to re-run; returns once the cluster is confirmed accepting connections.
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
PGDATA="$HOME/.local/share/lgi-pgdata"
export PGDATA

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "ERROR: postgres data dir missing ($PGDATA); run .cursor/install.sh" >&2
  exit 1
fi

if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/lgi-pg.log -w start
fi

"$PGBIN/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools
echo "start.sh complete: postgres accepting connections on :5433."
