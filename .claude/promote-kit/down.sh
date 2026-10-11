#!/usr/bin/env bash
# down.sh [--side old|new] [--remove] — stop the kit's dev servers by process group.
#
# The saved wrapper PID is not the server: up.sh records each server's process-group id in
# $KIT/pids/<side>.pgid, and this script signals that whole group (TERM, then KILL after 10s).
# Worktrees stay for reuse; --remove also runs `git worktree remove --force` on them.
# It never signals anything that is not in a recorded kit process group, so :3000 and the
# local stack (Postgres :5433, Convex :3210) are untouched.
set -uo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-/home/user/lgi-tools}"
SIDES=(old new)
REMOVE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --side) SIDES=("$2"); shift 2 ;;
    --remove) REMOVE=1; shift ;;
    *) echo "usage: $0 [--side old|new] [--remove]" >&2; exit 2 ;;
  esac
done

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

for side in "${SIDES[@]}"; do
  pgfile="$KIT/pids/$side.pgid"
  port="$(cat "$KIT/pids/$side.port" 2>/dev/null || true)"
  if [ -s "$pgfile" ]; then
    pgid="$(cat "$pgfile")"
    # Only a group whose processes run inside this kit counts (guards against a recycled PGID).
    ours=0
    for pid in $(pgrep -g "$pgid" 2>/dev/null); do
      case "$(readlink "/proc/$pid/cwd" 2>/dev/null)" in "$KIT"/*) ours=1; break ;; esac
    done
    if [ "$pgid" -gt 1 ] 2>/dev/null && [ "$ours" = 1 ] && kill -0 -- "-$pgid" 2>/dev/null; then
      echo "$side: stopping process group $pgid${port:+ (:$port)}"
      kill -TERM -- "-$pgid" 2>/dev/null
      for _ in $(seq 1 20); do kill -0 -- "-$pgid" 2>/dev/null || break; sleep 0.5; done
      if kill -0 -- "-$pgid" 2>/dev/null; then
        echo "$side: group $pgid ignored TERM, sending KILL"
        kill -KILL -- "-$pgid" 2>/dev/null
        sleep 1
      fi
    else
      echo "$side: process group ${pgid} is not running"
    fi
    rm -f "$pgfile" "$KIT/pids/$side.pid"
  else
    echo "$side: no recorded server"
  fi
  if [ -n "$port" ] && port_open "$port"; then
    echo "$side: warning, :$port still answers (not a kit process group?); left alone" >&2
  fi
  if [ "$REMOVE" = 1 ] && [ -e "$KIT/wt-$side/.git" ]; then
    echo "$side: removing worktree $KIT/wt-$side"
    git -C "$REPO" worktree remove --force "$KIT/wt-$side"
    rm -f "$KIT/pids/$side."{port,ref,sha}
  fi
done
[ "$REMOVE" = 1 ] && git -C "$REPO" worktree prune
exit 0
