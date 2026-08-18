#!/usr/bin/env bash
# Per-boot Cloud Agent startup.
#
# Reconcile Convex AUTH_JWKS once Next and the anonymous backend are up.
# Backgrounded: start must return; the waiter polls and then exits.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export PATH="$NPM_PREFIX/bin:$PATH"

nohup bash "$REPO_ROOT/.cursor/configure-convex-auth.sh" \
  >/tmp/lgi-convex-auth.log 2>&1 &

echo "start.sh complete."
