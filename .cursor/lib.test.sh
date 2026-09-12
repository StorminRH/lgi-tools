#!/usr/bin/env bash
# Focused tests for native Cursor Cloud helpers. No secret values printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/.cursor/lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

lgi_is_anonymous_deployment "anonymous:anonymous-agent" || fail "exact anonymous"
lgi_is_anonymous_deployment "anonymous:other" && fail "other anonymous name"
lgi_is_anonymous_deployment "local:cli" && fail "local selector"
lgi_is_convex_loopback_url "http://127.0.0.1:3210" || fail "loopback ip:3210"
lgi_is_convex_loopback_url "http://localhost:3210" || fail "loopback host:3210"
lgi_is_convex_loopback_url "https://localhost.example.com" && fail "localhost.example.com"
lgi_is_convex_loopback_url "https://evil.example/?localhost" && fail "query localhost"
lgi_is_convex_loopback_url "http://127.0.0.1:3000" && fail "wrong loopback port"
lgi_is_convex_loopback_url "http://127.0.0.1:3210/evil" && fail "loopback path"
[ "$(lgi_selector_class "https://localhost.example.com")" != loopback ] || fail "class localhost.example.com"
[ "$(lgi_selector_class "https://evil.example/?localhost")" != loopback ] || fail "class query localhost"
[ "$(lgi_selector_class "https://happy-animal-123.convex.cloud")" = hosted-convex ] || fail "convex cloud host"
[ "$(lgi_selector_class "postgres://u@ep-x.us-east-1.aws.neon.tech/db")" = hosted-neon ] || fail "neon host"
pass "malformed and hosted selectors"

tmp="$(mktemp)"
printf 'CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nNEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210\n' > "$tmp"
lgi_require_anonymous_convex_file "$tmp" || fail "exact anonymous file"
printf 'CONVEX_DEPLOYMENT=\nNEXT_PUBLIC_CONVEX_URL=\n' > "$tmp"
lgi_require_anonymous_convex_file "$tmp" || fail "empty file selectors"
printf 'CONVEX_DEPLOYMENT=prod:deployment\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "prod file should refuse"
fi
printf 'CONVEX_DEPLOYMENT=local:cli\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "local file should refuse"
fi
printf 'CONVEX_DEPLOYMENT=http://127.0.0.1:3210\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "loopback deployment selector should refuse"
fi
printf 'CONVEX_DEPLOYMENT=data:text/plain;charset=utf-8;base64,e30=\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "data-uri deployment should refuse"
fi
printf 'NEXT_PUBLIC_CONVEX_URL=https://localhost.example.com\n' > "$tmp"
if lgi_require_anonymous_convex_file "$tmp" 2>/dev/null; then
  fail "evil convex URL file should refuse"
fi
rm -f "$tmp"
pass "file selector gates"

pin_state="$(
  CONVEX_DEPLOYMENT= NEXT_PUBLIC_CONVEX_URL= bash -c '
    set -euo pipefail
    source "$1"
    lgi_pin_anonymous_convex_env
    if [ -z "${CONVEX_DEPLOYMENT+x}" ]; then echo deployment_unset; else echo deployment_set; fi
    if [ -z "${NEXT_PUBLIC_CONVEX_URL+x}" ]; then echo url_unset; else echo url_set; fi
  ' bash "$ROOT/.cursor/lib.sh"
)"
printf '%s\n' "$pin_state" | grep -qx deployment_unset || fail "empty process CONVEX_DEPLOYMENT must unset"
printf '%s\n' "$pin_state" | grep -qx url_unset || fail "empty process NEXT_PUBLIC_CONVEX_URL must unset"
if CONVEX_DEPLOYMENT=prod:foo bash -c 'set -euo pipefail; source "$1"; lgi_pin_anonymous_convex_env' bash "$ROOT/.cursor/lib.sh" 2>/dev/null; then
  fail "hosted process selector must refuse"
fi
if NEXT_PUBLIC_CONVEX_URL='https://evil.example/?localhost' bash -c 'set -euo pipefail; source "$1"; lgi_pin_anonymous_convex_env' bash "$ROOT/.cursor/lib.sh" 2>/dev/null; then
  fail "evil process URL must refuse"
fi
pass "empty and hosted process selectors"

lgi_jwks_has_signing_keys '{"keys":[{"kty":"EC","crv":"P-256","x":"a","y":"b"}]}' || fail "valid EC keyset"
lgi_jwks_has_signing_keys '{"keys":[]}' && fail "empty keys array"
lgi_jwks_has_signing_keys '{}' && fail "missing keys"
lgi_jwks_has_signing_keys 'not-json' && fail "invalid json"
lgi_jwks_has_signing_keys '{"keys":[{"kty":"oct"}]}' && fail "non-signing kty"
pass "JWKS signing-key parse"

prev_status="${LGI_AUTH_STATUS}"
auth_status="$(mktemp)"
LGI_AUTH_STATUS="$auth_status"
rm -f "$auth_status"
if lgi_require_auth_ready 2>/dev/null; then
  fail "missing status must refuse"
fi
printf '1\n' > "$auth_status"
if lgi_require_auth_ready 2>/dev/null; then
  fail "failed status must refuse"
fi
printf '0\n' > "$auth_status"
lgi_require_auth_ready || fail "status 0 must pass"
if CONVEX_DEPLOYMENT=prod:x LGI_AUTH_STATUS="$auth_status" bash "$ROOT/.cursor/configure-convex-auth.sh" 2>/dev/null; then
  fail "configure must fail on hosted selector"
fi
[ "$(tr -d '[:space:]' < "$auth_status")" = 1 ] || fail "configure failure must write status 1"
LGI_AUTH_STATUS="$auth_status"
if lgi_require_auth_ready 2>/dev/null; then
  fail "consumer must see configure failure"
fi
rm -f "$auth_status"
LGI_AUTH_STATUS="$prev_status"
pass "auth failure propagation"

lgi_forbidden_env_local_key EVE_CLIENT_ID || fail "EVE_CLIENT_ID must be forbidden"
lgi_forbidden_env_local_key CONVEX_DEPLOYMENT || fail "CONVEX_DEPLOYMENT must be forbidden"
lgi_forbidden_env_local_key DATABASE_URL && fail "DATABASE_URL must not be forbidden"
pass "forbidden .env.local keys"

if [ -x "${LGI_PG16_BIN}/psql" ] && "${LGI_PG16_BIN}/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools >/dev/null 2>&1; then
  lgi_sde_ready "$LGI_LOCAL_DB_URL" || fail "live cluster must satisfy full fixture census"
  report="$(lgi_sde_report "$LGI_LOCAL_DB_URL")"
  printf '%s\n' "$report" | grep -q '^market_prices=' || fail "live report market_prices"
  printf '%s\n' "$report" | grep -q '^sites=' || fail "live report sites"
  empty_db="lgi_sde_empty_$$"
  "${LGI_PG16_BIN}/createdb" -h localhost -p 5433 -U lgi "$empty_db"
  if lgi_sde_ready "postgres://lgi:lgi@localhost:5433/${empty_db}" 2>/dev/null; then
    "${LGI_PG16_BIN}/dropdb" -h localhost -p 5433 -U lgi "$empty_db"
    fail "empty database must fail SDE census"
  fi
  "${LGI_PG16_BIN}/dropdb" -h localhost -p 5433 -U lgi "$empty_db"
  pass "live and empty SDE census"
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

overlay_src="$(mktemp -d)"
overlay_dest="$(mktemp -d)"
mkdir -p "$overlay_src/rules"
printf 'first\n' > "$overlay_src/rules/pstack-models.mdc"
lgi_install_vm_home "$overlay_src" "$overlay_dest" || fail "overlay copy"
[ "$(cat "$overlay_dest/rules/pstack-models.mdc")" = first ] || fail "overlay dest content"
printf 'second\n' > "$overlay_src/rules/pstack-models.mdc"
lgi_install_vm_home "$overlay_src" "$overlay_dest" || fail "overlay overwrite"
[ "$(cat "$overlay_dest/rules/pstack-models.mdc")" = second ] || fail "overlay overwrite content"
if lgi_install_vm_home "" "$overlay_dest" 2>/dev/null; then
  fail "empty overlay src must refuse"
fi
if lgi_install_vm_home "$overlay_src/missing" "$overlay_dest" 2>/dev/null; then
  fail "missing overlay src must refuse"
fi
rm -rf "$overlay_src" "$overlay_dest"
pass "VM home overlay copy"

echo "lib.test.sh: all assertions passed"
