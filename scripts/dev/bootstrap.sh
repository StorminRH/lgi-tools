#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
node scripts/dev/run-local.mjs guard
source "$REPO_ROOT/scripts/dev/postgres.sh"
started_pg=0
service_pid=''
cleanup() {
  if [ -n "$service_pid" ]; then
    kill -TERM "$service_pid" 2>/dev/null || true
    wait "$service_pid" 2>/dev/null || true
  fi
  pg_stop_owned
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

reconcile() {
  node scripts/dev/run-local.mjs prepare
  local hash
  hash="$(node -e 'const fs=require("node:fs"),crypto=require("node:crypto"); console.log(crypto.createHash("sha256").update(fs.readFileSync("pnpm-lock.yaml")).update(fs.readFileSync("package.json")).digest("hex"))')"
  if [ ! -f node_modules/.lgi-bootstrap-lock ] || [ "$(cat node_modules/.lgi-bootstrap-lock)" != "$hash" ]; then
    pnpm install --frozen-lockfile
    pnpm exec playwright install chromium
    printf '%s' "$hash" > node_modules/.lgi-bootstrap-lock
  fi
  node scripts/dev/run-local.mjs pnpm db:migrate
  node scripts/dev/run-local.mjs pnpm exec tsx scripts/dev/sde.ts
  export CODEGRAPH_TELEMETRY=0
  if [ -d .codegraph ]; then codegraph sync; else codegraph init; fi
  git rev-parse HEAD
}

case "${1:-}" in
  install)
    [ "$(uname -s)" = Linux ] || { echo 'Use reconcile with local Docker on this host' >&2; exit 1; }
    pg_provision
    if ! command -v gh >/dev/null; then
      sudo apt-get update -q
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q gh
    fi
    LGI_CLI_REFRESH=1 source "$REPO_ROOT/scripts/dev/clis.sh"
    reconcile
    pnpm exec playwright install --with-deps chromium
    node scripts/dev/run-local.mjs node scripts/dev/services.mjs --once &
    service_pid=$!
    wait "$service_pid"
    service_pid=''
    ;;
  reconcile) reconcile ;;
  stack)
    source "$REPO_ROOT/scripts/dev/clis.sh"
    pg_start
    reconcile
    node scripts/dev/run-local.mjs node scripts/dev/services.mjs &
    service_pid=$!
    wait "$service_pid"
    service_pid=''
    ;;
  start)
    source "$REPO_ROOT/scripts/dev/clis.sh"
    if [ -n "${GITHUB_TOKEN:-}" ]; then gh auth setup-git; fi
    ;;
  postgres)
    pg_start
    while pg_verify >/dev/null; do sleep 5; done
    exit 1
    ;;
  convex) exec node scripts/dev/run-local.mjs pnpm exec convex dev ;;
  auth) exec node scripts/dev/run-local.mjs node --input-type=module -e 'import {configureAuth} from "./scripts/dev/auth.mjs"; await configureAuth()' ;;
  readiness)
    node scripts/dev/run-local.mjs pnpm exec tsx scripts/dev/sde.ts --check
    node scripts/dev/run-local.mjs node --input-type=module -e 'import {configureAuth} from "./scripts/dev/auth.mjs"; await configureAuth()'
    ;;
  *) echo 'Usage: scripts/dev/bootstrap.sh install|start|reconcile|stack|postgres|convex|auth|readiness' >&2; exit 2 ;;
esac
