#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions. Restores per-session
# state on the fresh clone, then starts the dev stack in the background.
# Its stdout becomes session context, so keep it short and factual.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$REPO_ROOT"
# shellcheck source=../cloud/lib.sh
source "$REPO_ROOT/.claude/cloud/lib.sh"
mkdir -p "$LGI_LOG_DIR"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export CONVEX_AGENT_MODE=anonymous' >>"$CLAUDE_ENV_FILE"
fi

echo "cloud setup: $(lgi_setup_summary)"
echo "cloud setup: $(lgi_hosted_credential_summary)"

if [ ! -f "$LGI_PROVISIONED_MARKER" ]; then
  echo "cloud setup: snapshot not provisioned; running .claude/cloud/setup.sh (log $LGI_LOG_DIR/setup.log)"
  if ! "$REPO_ROOT/.claude/cloud/setup.sh" >"$LGI_LOG_DIR/setup.log" 2>&1; then
    echo "cloud setup: FAILED; see $LGI_LOG_DIR/setup.log"
    exit 0
  fi
else
  lgi_restore_env_local .env.local
  pnpm install --frozen-lockfile --prefer-offline >"$LGI_LOG_DIR/install.log" 2>&1 \
    || { echo "cloud setup: pnpm install FAILED; see $LGI_LOG_DIR/install.log"; exit 0; }
fi

if ! "$REPO_ROOT/.claude/cloud/stack.sh" start >"$LGI_LOG_DIR/stack.log" 2>&1; then
  echo "cloud setup: dev stack FAILED to start; see $LGI_LOG_DIR/stack.log"
  exit 0
fi

# The codegraph index lives in the checkout, so each clone rebuilds it.
setsid nohup bash -c 'export CODEGRAPH_TELEMETRY=0; if [ -d .codegraph ]; then codegraph sync; else codegraph init; fi' \
  >"$LGI_LOG_DIR/codegraph.log" 2>&1 </dev/null &

echo "cloud setup: dev stack starting in the background. Check readiness with .claude/cloud/stack.sh status; guide: .claude/cloud/GUIDE.md"
if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  echo "cloud setup: WARNING CONVEX_DEPLOY_KEY is set in the environment; plain convex commands would target a hosted deployment. Rename it to LGI_CONVEX_STAGING_DEPLOY_KEY."
fi
