#!/usr/bin/env bash
# Per-session startup, run detached by the SessionStart hook so the session
# does not wait on it. Provisions (or installs dependencies), starts the dev
# stack, then refreshes the codegraph index. Progress is in
# $LGI_BOOTSTRAP_STATUS; `stack.sh status` reports it.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.claude/cloud/lib.sh"
mkdir -p "$LGI_LOG_DIR"

step() {
  local name="$1" log="$2"
  shift 2
  lgi_write_bootstrap_status "running $name"
  if ! "$@" >"$LGI_LOG_DIR/$log" 2>&1; then
    lgi_write_bootstrap_status "failed $name (see $LGI_LOG_DIR/$log)"
    exit 1
  fi
}

if [ ! -f "$LGI_PROVISIONED_MARKER" ]; then
  step setup setup.log "$REPO_ROOT/.claude/cloud/setup.sh"
else
  lgi_restore_env_local .env.local
  step install install.log lgi_install_deps
fi
step stack stack.log "$REPO_ROOT/.claude/cloud/stack.sh" start
lgi_write_bootstrap_status ok

# The codegraph index lives in the checkout, so each clone rebuilds it.
export CODEGRAPH_TELEMETRY=0
if [ -d .codegraph ]; then codegraph sync; else codegraph init; fi >"$LGI_LOG_DIR/codegraph.log" 2>&1
