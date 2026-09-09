#!/usr/bin/env bash
# Focused tests for native Cursor Cloud helpers. No secret values printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/.cursor/lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

[ "$(lgi_selector_class "")" = empty ] || fail "empty"
[ "$(lgi_selector_class "anonymous:anonymous-agent")" = anonymous-selector ] || fail "anonymous"
[ "$(lgi_selector_class "local:something")" = local-selector ] || fail "local"
[ "$(lgi_selector_class "prod:foo")" = hosted-selector ] || fail "prod"
[ "$(lgi_selector_class "dev:foo")" = hosted-selector ] || fail "dev"
[ "$(lgi_selector_class "preview:foo")" = hosted-selector ] || fail "preview"
[ "$(lgi_selector_class "http://127.0.0.1:3210")" = loopback ] || fail "loopback ip"
[ "$(lgi_selector_class "http://localhost:3000")" = loopback ] || fail "loopback host"
[ "$(lgi_selector_class "postgres://u@ep-x.us-east-1.aws.neon.tech/db")" = hosted-neon ] || fail "neon"
[ "$(lgi_selector_class "https://happy-animal-123.convex.cloud")" = hosted-convex ] || fail "convex cloud"
lgi_is_unsafe_convex_class hosted-selector || fail "hosted-selector unsafe"
lgi_is_unsafe_convex_class local-selector || fail "local-selector unsafe"
lgi_is_unsafe_convex_class anonymous-selector && fail "anonymous should be safe"
lgi_is_hosted_db_class hosted-neon || fail "neon is hosted db"
lgi_is_hosted_db_class loopback && fail "loopback is not hosted db"
pass "selector classes"

sql="$(lgi_sde_ready_sql)"
printf '%s' "$sql" | grep -q 'eve_data_meta' || fail "census must use eve_data_meta"
printf '%s' "$sql" | grep -q "key = 'sde_version'" || fail "census must read sde_version key"
printf '%s' "$sql" | grep -q 'type_dogma' || fail "census must use type_dogma"
printf '%s' "$sql" | grep -q 'eve_npc_stations' || fail "census must use eve_npc_stations"
printf '%s' "$sql" | grep -q 'eve_system_jumps' || fail "census must use eve_system_jumps"
printf '%s' "$sql" | grep -q 'eve_types' || fail "census must use eve_types"
printf '%s' "$sql" | grep -q 'industry_blueprints' || fail "census must use industry_blueprints"
printf '%s' "$sql" | grep -q 'blueprint_trees' || fail "census must use blueprint_trees"
printf '%s' "$sql" | grep -q 'npc_stations' && ! printf '%s' "$sql" | grep -q 'eve_npc_stations' && fail "bare npc_stations"
printf '%s' "$sql" | grep -Eq '(^|[^_])system_jumps' && fail "bare system_jumps"
printf '%s' "$sql" | grep -q 'sde_version[^_]' && printf '%s' "$sql" | grep -q 'FROM sde_version' && fail "must not query a sde_version table"
printf '%s' "$sql" | grep -q 'inv_types' && fail "invented inv_types"
printf '%s' "$sql" | grep -q 'wormhole_sites' && fail "invented wormhole_sites"
pass "census SQL uses schema-resolved names only"

tmp="$(mktemp)"
printf 'CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n' > "$tmp"
lgi_require_anonymous_convex_file "$tmp" || fail "anonymous file should pass"
printf 'CONVEX_DEPLOYMENT=prod:deployment\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "prod file should refuse"
fi
printf 'CONVEX_DEPLOYMENT=local:cli\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "local file should refuse"
fi
rm -f "$tmp"
pass "anonymous file gate"

lgi_forbidden_env_local_key EVE_CLIENT_ID || fail "EVE_CLIENT_ID must be forbidden"
lgi_forbidden_env_local_key EVE_CLIENT_SECRET || fail "EVE_CLIENT_SECRET must be forbidden"
lgi_forbidden_env_local_key NEXT_PUBLIC_CONVEX_URL || fail "NEXT_PUBLIC_CONVEX_URL must be forbidden"
lgi_forbidden_env_local_key CONVEX_DEPLOYMENT || fail "CONVEX_DEPLOYMENT must be forbidden"
lgi_forbidden_env_local_key DATABASE_URL && fail "DATABASE_URL must not be forbidden"
lgi_forbidden_env_local_key BETTER_AUTH_SECRET && fail "BETTER_AUTH_SECRET must not be forbidden"
pass "forbidden .env.local keys"

if [ -x "${LGI_PG16_BIN}/psql" ] && "${LGI_PG16_BIN}/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools >/dev/null 2>&1; then
  lgi_sde_ready "$LGI_LOCAL_DB_URL" || fail "live cluster should already satisfy schema-resolved SDE census"
  pass "live SDE census"
else
  echo "SKIP: live SDE census (postgres not ready)"
fi

# Dummy values only — never read process Cloud secrets.
eve_line="$(EVE_CLIENT_ID=dummy EVE_CLIENT_SECRET=dummy lgi_eve_runtime_secret_presence)"
[ "$eve_line" = "EVE runtime secrets: present" ] || fail "eve presence"
printf '%s' "$eve_line" | grep -qi dummy && fail "eve presence leaked a value"
eve_line="$(unset EVE_CLIENT_ID EVE_CLIENT_SECRET; lgi_eve_runtime_secret_presence)"
[ "$eve_line" = "EVE runtime secrets: absent" ] || fail "eve absence"
pass "EVE secret presence is names-only"

echo "lib.test.sh: all assertions passed"
