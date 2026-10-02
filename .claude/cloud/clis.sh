#!/usr/bin/env bash
# Pinned global CLIs for the cloud environment. Sourced by setup.sh.
# The image's global npm prefix is already on PATH, so no profile edits.

lgi_npm_cli() {
  local pkg="$1" bin="$2"
  if [ "${LGI_CLI_REFRESH:-0}" != 1 ] && command -v "$bin" >/dev/null 2>&1; then
    return 0
  fi
  echo "installing $pkg"
  npm install -g --no-fund --no-audit "$pkg"
}

lgi_install_clis() {
  lgi_npm_cli "@colbymchenry/codegraph@1.5.0" codegraph
  lgi_npm_cli "vercel@59.3.0" vercel
  lgi_npm_cli "neon@3.6.0" neon
}
