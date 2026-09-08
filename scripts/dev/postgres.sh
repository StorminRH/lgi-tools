#!/usr/bin/env bash
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA="${LGI_PGDATA:-$HOME/.local/share/lgi-pgdata}"
export PGDATA

pg_check_version() {
  [ -x "$PGBIN/pg_ctl" ] || { echo 'PostgreSQL 16 binaries are required' >&2; return 1; }
  [ "$(cat "$PGDATA/PG_VERSION" 2>/dev/null)" = 16 ] || { echo 'Expected a PostgreSQL 16 data directory; run install for a new cluster' >&2; return 1; }
}

pg_verify() {
  pg_check_version
  "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null
  local actual
  actual="$("$PGBIN/psql" -X -h localhost -p 5433 -U lgi -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT current_setting('data_directory') || '|' || current_setting('server_version_num')::int / 10000")"
  [ "$actual" = "$PGDATA|16" ] || { echo 'Port 5433 belongs to a different PostgreSQL cluster or major version' >&2; return 1; }
}

pg_start() {
  pg_check_version
  if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    started_pg=1
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -o "-p 5433 -h localhost -k /tmp" -w start
  fi
  pg_verify
}

pg_stop_owned() {
  if [ "${started_pg:-0}" = 1 ]; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop
    started_pg=0
  fi
}

pg_provision() {
  [ "$(uname -s)" = Linux ] || { echo 'Cloud Postgres installation requires Linux; use local Docker on macOS' >&2; return 1; }
  if [ ! -x "$PGBIN/pg_ctl" ]; then
    sudo apt-get update -q
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-16 postgresql-client-16
  fi
  mkdir -p "$PGDATA"
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    "$PGBIN/initdb" -D "$PGDATA" -U lgi --auth=trust --encoding=UTF8
  fi
  pg_start
  if [ "$("$PGBIN/psql" -X -h localhost -p 5433 -U lgi -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='lgi_tools'")" != 1 ]; then
    "$PGBIN/createdb" -h localhost -p 5433 -U lgi lgi_tools
  fi
}
