#!/usr/bin/env bash
# Entry point for the cloud environment's setup script (the Edit dialog runs
# it from outside the clone). Logs where it ran and never fails the session:
# the SessionStart hook reruns setup.sh when provisioning did not finish.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib.sh
source "$REPO_ROOT/.claude/cloud/lib.sh"
mkdir -p "$LGI_STATE_DIR"
log="$LGI_STATE_DIR/environment-setup.log"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) cwd=$PWD repo=$REPO_ROOT branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)" >>"$log"
if ! "$REPO_ROOT/.claude/cloud/setup.sh" >/dev/null 2>&1; then
  echo "setup.sh failed; see $LGI_SETUP_LOG" >>"$log"
fi
exit 0
