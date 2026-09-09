#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$REPO_ROOT/.cursor/lib.sh"
# shellcheck source=clis.sh
source "$REPO_ROOT/.cursor/clis.sh"

lgi_pin_local_db_env
lgi_pin_anonymous_convex_env
lgi_eve_runtime_secret_presence

# GITHUB_TOKEN already drives `gh`. setup-git is the credential helper so
# `git push github` works against the bare HTTPS remote.
if [ -n "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  gh auth setup-git
fi

rm -f "$LGI_AUTH_STATUS"
nohup bash "$REPO_ROOT/.cursor/configure-convex-auth.sh" \
  >/tmp/lgi-convex-auth.log 2>&1 &
echo "configure-convex-auth pid $! (status $LGI_AUTH_STATUS; log /tmp/lgi-convex-auth.log)"

echo "start.sh complete."
