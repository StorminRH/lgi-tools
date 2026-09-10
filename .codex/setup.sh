#!/usr/bin/env bash
# Native Codex local or cloud setup. Does not read .cursor/environment.json.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=../.cursor/lib.sh
source "$REPO_ROOT/.cursor/lib.sh"

lgi_pin_local_db_env
lgi_pin_anonymous_convex_env

if [ ! -f .env.local ]; then
  cp .env.example .env.local
fi
lgi_require_anonymous_convex_file .env.local

pnpm install --frozen-lockfile

if lgi_pg16_bin >/dev/null 2>&1; then
  echo "codex setup: PostgreSQL 16 present at ${LGI_PG16_BIN}"
else
  echo "codex setup: PostgreSQL 16 missing at ${LGI_PG16_BIN}. Install it, or use docker compose from README local development." >&2
fi

echo "codex setup: reuse agent pins in .codex/agents/*.toml"
echo "codex setup: Cursor pstack-models.mdc is Cursor-only. Do not copy environment.json."
echo "codex setup: next is pnpm typecheck, pnpm lint, and focused Vitest from CONTRIBUTING.md"
