#!/usr/bin/env bash
# Per-boot Cloud Agent startup.
#
# Put the user-global CLIs on PATH (install any a stale snapshot is missing),
# then reconcile Convex AUTH_JWKS once Next and the anonymous backend are up.
# Backgrounded: start must return; the waiter polls and then exits.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=clis.sh
source "$REPO_ROOT/.cursor/clis.sh"

nohup bash "$REPO_ROOT/.cursor/configure-convex-auth.sh" \
  >/tmp/lgi-convex-auth.log 2>&1 &

echo "start.sh complete."
