#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions. Reports the environment,
# then starts bootstrap.sh detached so the session does not wait on it.
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
if [ -f "$LGI_STATE_DIR/environment-setup.log" ]; then
  echo "cloud setup: environment script: $(tail -n 2 "$LGI_STATE_DIR/environment-setup.log" | tr '\n' ' ')"
else
  echo "cloud setup: environment script: no log (it did not run, or predates the logging version)"
fi
echo "cloud setup: $(lgi_hosted_credential_summary)"

lgi_write_bootstrap_status "starting"
setsid nohup "$REPO_ROOT/.claude/cloud/bootstrap.sh" >"$LGI_LOG_DIR/bootstrap.log" 2>&1 </dev/null &
echo "cloud setup: dev stack starting in the background. Run .claude/cloud/stack.sh wait before using pnpm, the database, or the local servers; guide: .claude/cloud/GUIDE.md"
if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  echo "cloud setup: WARNING CONVEX_DEPLOY_KEY is set in the environment; plain convex commands would target a hosted deployment. Rename it to LGI_CONVEX_STAGING_DEPLOY_KEY."
fi
