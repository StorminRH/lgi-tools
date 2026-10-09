#!/usr/bin/env bash
# Entry point for the cloud environment's setup script (the Edit dialog runs
# it from outside the clone). The platform kills a setup script that runs
# too long, which fails the session, so setup.sh runs under a time cap in its
# own process group. Whatever finishes is kept in the snapshot; the
# SessionStart hook's bootstrap reruns setup.sh to finish the rest. Never
# fails the session.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib.sh
source "$REPO_ROOT/.claude/cloud/lib.sh"
mkdir -p "$LGI_STATE_DIR"
log="$LGI_STATE_DIR/environment-setup.log"
cap="${LGI_SETUP_CAP_SECONDS:-200}"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) cwd=$PWD repo=$REPO_ROOT branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null) cap=${cap}s" >>"$log"

setsid "$REPO_ROOT/.claude/cloud/setup.sh" >/dev/null 2>&1 </dev/null &
pid=$!
start=$SECONDS
while kill -0 "$pid" 2>/dev/null && [ $((SECONDS - start)) -lt "$cap" ]; do
  sleep 1
done
if kill -0 "$pid" 2>/dev/null; then
  # Ask setup.sh to stop so its exit trap records the phase and stops
  # Postgres. If it is still running after the grace period, force its
  # whole process group before waiting, or a TERM it ignores or delays
  # would hold this script past the platform's own limit.
  kill -TERM -- "-$pid" 2>/dev/null
  for _ in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -0 "$pid" 2>/dev/null && kill -KILL -- "-$pid" 2>/dev/null
  echo "setup.sh hit the ${cap}s cap; bootstrap finishes it after the session starts" >>"$log"
fi
wait "$pid" 2>/dev/null
rc=$?
# Children that left the group leader behind.
kill -KILL -- "-$pid" 2>/dev/null
lgi_stop_orphan_convex_backend
[ "$rc" = 0 ] || echo "setup.sh exit $rc after $((SECONDS - start))s: $(head -1 "$LGI_SETUP_STATUS" 2>/dev/null)" >>"$log"
exit 0
