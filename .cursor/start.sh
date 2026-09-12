#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$REPO_ROOT/.cursor/lib.sh"
# shellcheck source=clis.sh
source "$REPO_ROOT/.cursor/clis.sh"

lgi_pin_local_db_env
lgi_pin_anonymous_convex_env
lgi_require_anonymous_convex_file "$REPO_ROOT/.env.local"
lgi_eve_runtime_secret_presence
lgi_install_vm_home "$REPO_ROOT/.cursor/vm-home"

# Configure Git authentication for the checkout's GitHub HTTPS remote
# using the injected GitHub token, regardless of the remote's name.
if [ -n "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  gh auth setup-git
fi

rm -f "$LGI_AUTH_STATUS"
echo "start.sh finished. AUTH reconcile is the configure-convex-auth terminal."
