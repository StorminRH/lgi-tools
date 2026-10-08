#!/usr/bin/env bash
# Local dev stack for cloud sessions: Postgres :5433, anonymous Convex :3210
# (HTTP actions :3211), Next :3000, then the Convex auth reconcile.
# Services run detached with logs in $LGI_LOG_DIR (/tmp/lgi).
#
#   stack.sh start     start whatever is not already running (idempotent)
#   stack.sh stop      stop Next, Convex, and Postgres
#   stack.sh restart   stop, then start
#   stack.sh status    one line per service; exit 1 unless all are ready
#   stack.sh wait [s]  block until ready (default 300s); exit 1 on failure or timeout
#   stack.sh logs [postgres|convex|next|convex-auth]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.claude/cloud/lib.sh"

mkdir -p "$LGI_LOG_DIR"
PGBIN="$(lgi_pg16_bin)"

pidfile() { printf '%s/%s.pid' "$LGI_LOG_DIR" "$1"; }

spawn() {
  local name="$1"
  shift
  setsid nohup "$@" >"$LGI_LOG_DIR/$name.log" 2>&1 </dev/null &
  echo $! >"$(pidfile "$name")"
}

stop_spawned() {
  local name="$1" pid
  pid="$(cat "$(pidfile "$name")" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  fi
  rm -f "$(pidfile "$name")"
}

start_postgres() {
  if [ ! -f "$LGI_PGDATA/PG_VERSION" ]; then
    echo "ERROR: postgres data dir missing ($LGI_PGDATA); run .claude/cloud/setup.sh" >&2
    return 1
  fi
  if ! lgi_pg_server "$PGBIN/pg_ctl" -D "$LGI_PGDATA" status >/dev/null 2>&1; then
    # The snapshot can carry a lock file from the setup run; nothing holds it.
    rm -f "$LGI_PGDATA/postmaster.pid"
    lgi_pg_server "$PGBIN/pg_ctl" -D "$LGI_PGDATA" -l "$LGI_PG_LOG" -w start >/dev/null
  fi
  lgi_wait_for_postgres
}

start_convex() {
  lgi_stop_orphan_convex_backend
  lgi_port_open "$LGI_CONVEX_PORT" && return 0
  local secret
  secret="${CONVEX_SERVICE_SECRET:-$(lgi_file_env_val .env.local CONVEX_SERVICE_SECRET)}"
  local jwks="${AUTH_JWKS:-$LGI_PLACEHOLDER_JWKS}"
  [ -f /tmp/lgi-auth-jwks-uri ] && jwks="$(cat /tmp/lgi-auth-jwks-uri)"
  AUTH_ISSUER_URL="${AUTH_ISSUER_URL:-http://localhost:3000}" \
    SITE_URL="${SITE_URL:-http://localhost:3000}" \
    CONVEX_SERVICE_SECRET="$secret" \
    AUTH_JWKS="$jwks" \
    spawn convex pnpm exec convex dev --typecheck=disable
}

start_next() {
  lgi_port_open 3000 && return 0
  spawn next pnpm dev
}

start_auth() {
  if lgi_require_auth_ready 2>/dev/null; then
    return 0
  fi
  rm -f "$LGI_AUTH_STATUS"
  spawn convex-auth "$REPO_ROOT/.claude/cloud/configure-convex-auth.sh"
}

cmd_start() {
  lgi_pin_local_db_env
  lgi_pin_anonymous_convex_env
  lgi_require_anonymous_convex_file .env.local
  start_postgres
  # Fresh branches may add migrations; the migrator is idempotent.
  lgi_run_local_db pnpm db:migrate >"$LGI_LOG_DIR/migrate.log" 2>&1 || {
    echo "ERROR: pnpm db:migrate failed; see $LGI_LOG_DIR/migrate.log" >&2
    return 1
  }
  lgi_ensure_sde_ready >"$LGI_LOG_DIR/sde.log" 2>&1 || {
    echo "ERROR: SDE readiness failed; see $LGI_LOG_DIR/sde.log" >&2
    return 1
  }
  start_convex
  start_next
  start_auth
  echo "stack starting: Next :3000, Convex :3210, auth status $LGI_AUTH_STATUS (logs: $LGI_LOG_DIR)"
}

cmd_stop() {
  stop_spawned convex-auth
  stop_spawned next
  stop_spawned convex
  lgi_pg_server "$PGBIN/pg_ctl" -D "$LGI_PGDATA" -w stop >/dev/null 2>&1 || true
  rm -f "$LGI_AUTH_STATUS"
}

cmd_status() {
  local ok=0 auth boot
  report() { printf '%-12s %s\n' "$1" "$2"; }
  boot="$(cat "$LGI_BOOTSTRAP_STATUS" 2>/dev/null || echo 'not started')"
  report bootstrap "$boot"
  [ "$boot" = ok ] || ok=1
  if "$PGBIN/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools >/dev/null 2>&1; then
    report postgres "ready :5433"
  else
    report postgres down; ok=1
  fi
  if lgi_port_open "$LGI_CONVEX_PORT"; then report convex "ready :3210"; else report convex down; ok=1; fi
  if lgi_port_open 3000; then report next "ready :3000"; else report next down; ok=1; fi
  auth="$({ tr -d '[:space:]' <"$LGI_AUTH_STATUS"; } 2>/dev/null || echo pending)"
  case "$auth" in
    0) report convex-auth ready ;;
    pending) report convex-auth pending; ok=1 ;;
    *) report convex-auth "failed (status $auth)"; ok=1 ;;
  esac
  return "$ok"
}

case "${1:-status}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  wait)
    # Block until the stack is ready, up to $2 seconds (default 300).
    deadline=$((SECONDS + ${2:-300}))
    until cmd_status >/dev/null 2>&1; do
      case "$(cat "$LGI_BOOTSTRAP_STATUS" 2>/dev/null)" in failed*) cmd_status; exit 1 ;; esac
      [ "$SECONDS" -lt "$deadline" ] || { cmd_status; exit 1; }
      sleep 2
    done
    cmd_status
    ;;
  logs)
    if [ "${2:-next}" = postgres ]; then
      tail -n 80 "$LGI_PG_LOG"
    else
      tail -n 80 "$LGI_LOG_DIR/${2:-next}.log"
    fi
    ;;
  *) echo "usage: stack.sh start|stop|restart|status|wait [seconds]|logs [service]" >&2; exit 2 ;;
esac
