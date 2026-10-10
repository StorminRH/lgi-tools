#!/usr/bin/env bash
# Keeps a wave run from leaving processes or worktrees behind on the machine.
#   cleanup.sh snapshot <dir>  remember the dev processes and git worktrees present before the run
#   cleanup.sh sweep <dir>     stop dev processes the run started that are still alive, remove
#                              clean worktrees it added (dirty ones are reported, never deleted),
#                              prune stale worktree records, and report disk use
# "Dev processes" are vitest, next (dev/start/build/server), the Convex local backend or dev
# server, and Fallow's tsgo sidecar. Anything already running at snapshot time is left alone.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
mode=${1:?snapshot or sweep}
dir=${2:?state directory}
mkdir -p "$dir"
PAT='[v]itest|[n]ext-server|[n]ext/dist/bin/next|[c]onvex-local-backend|[c]onvex dev|[t]sgo'
pids() { pgrep -f "$PAT" 2>/dev/null | sort; }
worktrees() { git worktree list --porcelain | awk '/^worktree /{ sub(/^worktree /, ""); print }' | sort; }

case $mode in
  snapshot)
    pids > "$dir/pids-before"
    worktrees > "$dir/worktrees-before"
    echo "snapshot: $(wc -l < "$dir/pids-before" | tr -d ' ') dev processes, $(wc -l < "$dir/worktrees-before" | tr -d ' ') worktrees"
    ;;
  sweep)
    [ -f "$dir/pids-before" ] || : > "$dir/pids-before"
    [ -f "$dir/worktrees-before" ] || worktrees > "$dir/worktrees-before"
    for p in $(comm -13 "$dir/pids-before" <(pids)); do
      what=$(ps -o args= -p "$p" 2>/dev/null | cut -c1-100)
      [ -n "$what" ] && kill "$p" 2>/dev/null && echo "stopped $p: $what"
    done
    sleep 1
    for p in $(comm -13 "$dir/pids-before" <(pids)); do kill -9 "$p" 2>/dev/null && echo "killed $p"; done
    for w in $(comm -13 "$dir/worktrees-before" <(worktrees)); do
      if git worktree remove "$w" 2>/dev/null; then echo "removed worktree $w"; else echo "LEFT dirty worktree $w (inspect, then: git worktree remove --force $w)"; fi
    done
    git worktree prune
    echo "worktrees: $(worktrees | wc -l | tr -d ' ')"
    du -sh .next coverage "$dir" 2>/dev/null | sed 's/^/disk: /'
    df -h . | tail -1 | awk '{print "free: " $4 " of " $2}'
    ;;
  *) echo "usage: cleanup.sh snapshot|sweep <dir>"; exit 2 ;;
esac
