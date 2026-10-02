#!/usr/bin/env bash
# Run a Convex CLI command against the staging deployment (proper-squid-200).
# The key lives in LGI_CONVEX_STAGING_DEPLOY_KEY, never CONVEX_DEPLOY_KEY, so
# the local stack and plain `convex` commands stay on the anonymous backend.
#
#   .claude/cloud/convex-staging.sh env list
#   .claude/cloud/convex-staging.sh data <table> --limit 5
#   .claude/cloud/convex-staging.sh run <function> '<json args>'
#   .claude/cloud/convex-staging.sh logs --history 50
#
# `dev` is refused; `deploy` and `import` also need LGI_ALLOW_STAGING_PUSH=1.
set -euo pipefail

LGI_STAGING_DEPLOYMENT=proper-squid-200
key="${LGI_CONVEX_STAGING_DEPLOY_KEY:-}"
if [ -z "$key" ]; then
  echo "ERROR: LGI_CONVEX_STAGING_DEPLOY_KEY is not set in the cloud environment" >&2
  exit 1
fi
case "$key" in
  *:"$LGI_STAGING_DEPLOYMENT"\|*) ;;
  *)
    echo "ERROR: LGI_CONVEX_STAGING_DEPLOY_KEY is not a $LGI_STAGING_DEPLOYMENT deploy key" >&2
    exit 1
    ;;
esac
case "${1:-}" in
  dev)
    echo "ERROR: refusing convex dev against staging; use the local stack" >&2
    exit 1
    ;;
  deploy | import)
    if [ "${LGI_ALLOW_STAGING_PUSH:-0}" != 1 ]; then
      echo "ERROR: convex $1 changes staging; rerun with LGI_ALLOW_STAGING_PUSH=1 only when asked to" >&2
      exit 1
    fi
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
exec env -u CONVEX_DEPLOYMENT -u CONVEX_AGENT_MODE -u NEXT_PUBLIC_CONVEX_URL \
  CONVEX_DEPLOY_KEY="$key" pnpm exec convex "$@"
