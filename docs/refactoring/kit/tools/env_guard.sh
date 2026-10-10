#!/usr/bin/env bash
# Prepares the tree for a wave's checks.
# - next dev rewrites .next/dev/types while it runs, which breaks typecheck
#   mid-run, so it must be stopped (pass --kill-next to stop it here).
# - Route types are generated once into .next/types with next typegen.
# - Local Postgres must answer on :5433 for the *.db.test.ts suites.
# Usage: env_guard.sh [--kill-next]
cd "$(git rev-parse --show-toplevel)" || exit 2
# The DB test harness creates and drops test_* schemas in whatever DATABASE_URL names.
for v in DATABASE_URL DATABASE_URL_UNPOOLED; do
  val=${!v:-}
  case "$val" in
    ''|postgres://lgi:lgi@localhost:5433/*|postgres://lgi:lgi@127.0.0.1:5433/*) ;;
    *) echo "$v is exported and does not point at the local Postgres on :5433: unset it for the wave"; exit 1 ;;
  esac
done
if pgrep -f '[n]ext-server|[n]ext/dist/bin/next dev' >/dev/null 2>&1; then
  if [ "$1" = "--kill-next" ]; then
    pkill -f '[n]ext-server'; pkill -f '[n]ext/dist/bin/next dev'; sleep 1
  else
    echo "next dev is running: stop it while a wave runs (it rewrites .next/dev/types under typecheck), or pass --kill-next"
    exit 1
  fi
fi
rm -rf .next/dev/types
[ -f .next/types/validator.ts ] || pnpm exec next typegen >/dev/null 2>&1
pg_up() { (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; }
if ! pg_up; then
  if [ -n "$CLAUDE_CODE_REMOTE" ] && [ -x .claude/cloud/stack.sh ]; then
    .claude/cloud/stack.sh start >/dev/null 2>&1
  else
    docker compose up -d postgres >/dev/null 2>&1
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do pg_up && break; sleep 2; done
fi
pg_up || { echo "postgres is not answering on :5433 (docker compose up -d postgres)"; exit 1; }
echo "next-dev=stopped route-types=$(ls .next/types 2>/dev/null | wc -l | tr -d ' ') postgres=:5433"
