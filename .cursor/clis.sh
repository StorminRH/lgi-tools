#!/usr/bin/env bash
# User-global CLIs for Cloud Agents. Sourced by install.sh (snapshot refresh)
# and start.sh (install only what a pod from an older snapshot is missing).
#
# origin is the Cloud Agent runtime. convex and fallow stay project-local
# (`pnpm exec`). This file installs binaries; it does not authenticate.
# Depot, Vercel, and Neon pick up Cloud Agent Secrets when a command needs them.
#
# Pins:
#   @colbymchenry/codegraph@1.5.0  (repo-mapper / cloud-agent.md)
#   vercel@59.3.0
#   neon@3.6.0                     (`pnpm neon:apply` spawns `neon`)
#   depot 2.102.4
set -euo pipefail

lgi_export_cli_path() {
  NPM_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
  DEPOT_INSTALL_DIR="${DEPOT_INSTALL_DIR:-$HOME/.local/bin}"
  mkdir -p "$NPM_PREFIX" "$DEPOT_INSTALL_DIR"
  npm config set prefix "$NPM_PREFIX"
  export NPM_PREFIX DEPOT_INSTALL_DIR
  export PATH="$NPM_PREFIX/bin:$DEPOT_INSTALL_DIR:$PATH"
}

lgi_ensure_profile_path() {
  if ! grep -q '.npm-global/bin' "$HOME/.profile" 2>/dev/null; then
    printf '\nexport PATH="%s/bin:$PATH"\n' "$NPM_PREFIX" >> "$HOME/.profile"
  fi
}

lgi_npm_cli() {
  local pkg="$1" bin="$2"
  if [ "${LGI_CLI_REFRESH:-0}" != 1 ] && command -v "$bin" >/dev/null 2>&1; then
    return 0
  fi
  echo "installing $pkg"
  npm install -g --no-fund --no-audit "$pkg"
}

lgi_depot_cli() {
  if [ "${LGI_CLI_REFRESH:-0}" != 1 ] && command -v depot >/dev/null 2>&1; then
    return 0
  fi
  echo "installing depot 2.102.4"
  curl -fsSL https://depot.dev/install-cli.sh | DEPOT_INSTALL_DIR="$DEPOT_INSTALL_DIR" sh -s 2.102.4
}

lgi_install_clis() {
  lgi_export_cli_path
  lgi_ensure_profile_path
  lgi_npm_cli "@colbymchenry/codegraph@1.5.0" codegraph
  lgi_npm_cli "vercel@59.3.0" vercel
  lgi_npm_cli "neon@3.6.0" neon
  lgi_depot_cli
}

lgi_install_clis
