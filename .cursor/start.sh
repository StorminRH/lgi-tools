#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=clis.sh
source "$REPO_ROOT/.cursor/clis.sh"

# GITHUB_TOKEN already drives `gh`. setup-git is the credential helper so
# `git push github` works against the bare HTTPS remote.
if [ -n "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  gh auth setup-git
fi

nohup bash "$REPO_ROOT/.cursor/configure-convex-auth.sh" \
  >/tmp/lgi-convex-auth.log 2>&1 &

echo "start.sh complete."
