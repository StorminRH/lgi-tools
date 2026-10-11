#!/usr/bin/env bash
# up.sh <old-ref> <new-ref> — check out OLD and NEW in kit worktrees and serve each with `next dev`.
#
#   OLD → $KIT/wt-old on :3101 (override with OLD_PORT)
#   NEW → $KIT/wt-new on :3102 (override with NEW_PORT)
#
# Reuses existing worktrees (reset to the ref, untracked files cleaned; ignored files such as
# node_modules, .next and .env.local are kept) and only reinstalls when pnpm-lock.yaml changed.
# Logs: $KIT/dev-old.log, $KIT/dev-new.log. PIDs/PGIDs: $KIT/pids/<side>.{pid,pgid,port,ref,sha}.
# Never touches the main checkout's files, the :3000 server, or anything but the local stack.
#
# Options (env): NO_FETCH=1 skips `git fetch origin`; WAIT_SECS (default 420) bounds the wait.
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-/home/user/lgi-tools}"
OLD_PORT="${OLD_PORT:-3101}"
NEW_PORT="${NEW_PORT:-3102}"
WAIT_SECS="${WAIT_SECS:-420}"
LOCAL_DB='postgres://lgi:lgi@localhost:5433/lgi_tools'

if [ $# -ne 2 ]; then
  echo "usage: $0 <old-ref> <new-ref>   e.g. $0 origin/staging origin/development" >&2
  exit 2
fi
OLD_REF="$1"
NEW_REF="$2"

for p in "$OLD_PORT" "$NEW_PORT"; do
  case "$p" in 3000|3210|3211|5433) echo "refusing to use reserved port $p" >&2; exit 2 ;; esac
done

log() { printf '[up %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# The local stack must be up; the kit servers share its database and Convex.
port_open 5433 || { echo "local Postgres :5433 is not up (run .claude/cloud/stack.sh status)" >&2; exit 1; }
port_open 3210 || log "warning: local Convex :3210 is not answering"

if [ -z "${NO_FETCH:-}" ]; then
  log "git fetch origin"
  git -C "$REPO" fetch origin --quiet
fi
OLD_SHA="$(git -C "$REPO" rev-parse --verify "$OLD_REF^{commit}")"
NEW_SHA="$(git -C "$REPO" rev-parse --verify "$NEW_REF^{commit}")"

mkdir -p "$KIT/pids"

# Both servers share the stack's database and Convex, which hold the schema of the checkout on
# :3000. Say so when the refs disagree about migrations or Convex functions.
if ! git -C "$REPO" diff --quiet "$OLD_SHA" "$NEW_SHA" -- drizzle convex; then
  log "WARNING: drizzle/ or convex/ differ between $OLD_REF and $NEW_REF; the shared local DB/Convex"
  log "         match only one of them. Check: git -C $REPO diff --stat $OLD_SHA $NEW_SHA -- drizzle convex"
fi

# Stop a side's running server (by process group) before its worktree moves.
stop_side() {
  "$KIT/down.sh" --side "$1" >/dev/null 2>&1 || true
}

prepare_worktree() {
  local side="$1" sha="$2" dir="$KIT/wt-$1"
  if git -C "$REPO" worktree list --porcelain | grep -qx "worktree $dir"; then
    if [ ! -e "$dir/.git" ]; then
      log "$side: stale worktree registration, pruning"
      git -C "$REPO" worktree prune
    fi
  fi
  if [ -e "$dir/.git" ]; then
    log "$side: resetting $dir to ${sha:0:8}"
    git -C "$dir" checkout --quiet --detach --force "$sha"
    git -C "$dir" reset --quiet --hard "$sha"
    git -C "$dir" clean -fdq   # untracked only; ignored files (node_modules, .next, .env.local) stay
  else
    if [ -e "$dir" ]; then
      echo "$dir exists but is not a worktree; move it away first" >&2
      exit 1
    fi
    log "$side: adding worktree $dir at ${sha:0:8}"
    git -C "$REPO" worktree add --detach "$dir" "$sha" >/dev/null
  fi
  install -m 600 "$REPO/.env.local" "$dir/.env.local"
}

install_deps() {
  local side="$1" dir="$KIT/wt-$1"
  local want have stamp="$dir/node_modules/.review-kit-lock.sha256"
  want="$(sha256sum "$dir/pnpm-lock.yaml" | cut -d' ' -f1)"
  have="$(cat "$stamp" 2>/dev/null || true)"
  if [ -d "$dir/node_modules" ] && [ "$want" = "$have" ]; then
    log "$side: lockfile unchanged, skipping install"
    return
  fi
  log "$side: pnpm install --frozen-lockfile --prefer-offline (log $KIT/install-$side.log)"
  (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline) >"$KIT/install-$side.log" 2>&1 || {
    echo "$side: install failed, see $KIT/install-$side.log" >&2
    exit 1
  }
  echo "$want" >"$stamp"
}

start_side() {
  local side="$1" port="$2" ref="$3" sha="$4" dir="$KIT/wt-$1"
  local origin="http://localhost:$port" pidfile="$KIT/pids/$side.pgid"
  if port_open "$port"; then
    echo "port $port is still in use after stopping $side; refusing to start" >&2
    exit 1
  fi
  rm -f "$pidfile" "$KIT/pids/$side.pid"
  log "$side: next dev on $origin (log $KIT/dev-$side.log)"
  # setsid makes the inner shell a session and process-group leader; it records $$ (= PGID)
  # and then execs pnpm, so every child of next dev shares that group.
  (
    cd "$dir"
    exec setsid bash -c '
      echo $$ > "$0"
      exec env \
        PORT="$1" NODE_ENV=development NEXT_TELEMETRY_DISABLED=1 \
        DATABASE_URL="$2" DATABASE_URL_UNPOOLED="$2" DATABASE_MIGRATION_URL="$2" \
        LOCAL_DB_DRIVER=postgres-js CONVEX_AGENT_MODE=anonymous \
        SUPERADMIN_CHARACTER_ID=9000001 \
        BETTER_AUTH_URL="$3" SITE_URL="$3" AUTH_ISSUER_URL="$3" \
        pnpm exec next dev -p "$1"
    ' "$pidfile" "$port" "$LOCAL_DB" "$origin"
  ) >"$KIT/dev-$side.log" 2>&1 < /dev/null &
  local wrapper=$!
  for _ in $(seq 1 50); do [ -s "$pidfile" ] && break; sleep 0.1; done
  local pgid
  pgid="$(cat "$pidfile" 2>/dev/null || true)"
  [ -n "$pgid" ] || { echo "$side: server did not record its PGID" >&2; exit 1; }
  echo "$wrapper" >"$KIT/pids/$side.pid"
  echo "$port" >"$KIT/pids/$side.port"
  echo "$ref" >"$KIT/pids/$side.ref"
  echo "$sha" >"$KIT/pids/$side.sha"
  log "$side: wrapper pid $wrapper, process group $pgid"
}

wait_side() {
  local side="$1" port="$2" deadline=$((SECONDS + WAIT_SECS)) code pgid
  pgid="$(cat "$KIT/pids/$side.pgid")"
  while :; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 120 "http://localhost:$port/" || true)"
    case "$code" in
      2??|3??|4??) log "$side: http://localhost:$port answered $code"; return 0 ;;
    esac
    if ! kill -0 -- "-$pgid" 2>/dev/null; then
      echo "$side: server exited; tail of $KIT/dev-$side.log:" >&2
      tail -n 30 "$KIT/dev-$side.log" >&2
      exit 1
    fi
    if [ $SECONDS -ge $deadline ]; then
      echo "$side: no answer on :$port after ${WAIT_SECS}s; see $KIT/dev-$side.log" >&2
      exit 1
    fi
    sleep 2
  done
}

stop_side old
stop_side new
prepare_worktree old "$OLD_SHA"
prepare_worktree new "$NEW_SHA"
install_deps old &
inst_old=$!
install_deps new &
inst_new=$!
wait "$inst_old"
wait "$inst_new"

start_side old "$OLD_PORT" "$OLD_REF" "$OLD_SHA"
start_side new "$NEW_PORT" "$NEW_REF" "$NEW_SHA"
wait_side old "$OLD_PORT" &
w_old=$!
wait_side new "$NEW_PORT" &
w_new=$!
wait "$w_old"
wait "$w_new"

cat <<EOF
OLD  $OLD_REF  ${OLD_SHA:0:8}  http://localhost:$OLD_PORT  ($KIT/wt-old, log dev-old.log, pgid $(cat "$KIT/pids/old.pgid"))
NEW  $NEW_REF  ${NEW_SHA:0:8}  http://localhost:$NEW_PORT  ($KIT/wt-new, log dev-new.log, pgid $(cat "$KIT/pids/new.pgid"))
Next: node $KIT/pilot.mjs http://localhost:$OLD_PORT http://localhost:$NEW_PORT
EOF
