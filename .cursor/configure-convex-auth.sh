#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
source "$REPO_ROOT/.cursor/lib.sh"

lgi_pin_anonymous_convex_env
lgi_require_anonymous_convex_file .env.local

env_val() { grep -E "^${1}=" .env.local 2>/dev/null | head -1 | cut -d= -f2-; }

fail_auth() {
  echo "$1" >&2
  lgi_write_auth_status 1
  exit 1
}

echo "waiting for Next /api/auth/jwks and Convex :3210 ..."
jwks_json=""
for _ in $(seq 1 180); do
  if curl -sf -o /dev/null http://127.0.0.1:3210 >/dev/null 2>&1 \
    || curl -sf -o /dev/null http://127.0.0.1:3210/version >/dev/null 2>&1; then
    if jwks_json="$(curl -sf http://localhost:3000/api/auth/jwks 2>/dev/null)"; then
      if printf '%s' "$jwks_json" | grep -q '"keys"'; then
        break
      fi
    fi
  fi
  jwks_json=""
  sleep 2
done

if ! printf '%s' "$jwks_json" | grep -q '"keys"'; then
  fail_auth "configure-convex-auth: Next JWKS not ready; refusing placeholder AUTH_JWKS"
fi

jwks_uri="data:text/plain;charset=utf-8;base64,$(printf '%s' "$jwks_json" | base64 -w0)"
if [ "$jwks_uri" = "$LGI_PLACEHOLDER_JWKS" ]; then
  fail_auth "configure-convex-auth: JWKS decoded to the empty placeholder"
fi

printf '%s' "$jwks_uri" > /tmp/lgi-auth-jwks-uri
chmod 600 /tmp/lgi-auth-jwks-uri

# Injected Cloud Agent Secrets override `.env.local` at runtime. Prefer the
# effective environment so Convex gets the same secret Next is using.
secret="${CONVEX_SERVICE_SECRET:-$(env_val CONVEX_SERVICE_SECRET)}"
if [ -z "$secret" ]; then
  fail_auth "configure-convex-auth: CONVEX_SERVICE_SECRET missing from the environment and .env.local"
fi

# Do not pass `--deployment local` here: that flag talks to api.convex.dev
# and 401s without a login. The anonymous backend is selected by
# CONVEX_DEPLOYMENT=anonymous:anonymous-agent in .env.local.
convex_env() {
  pnpm exec convex env set "$@"
}

convex_env AUTH_ISSUER_URL http://localhost:3000
convex_env SITE_URL http://localhost:3000
# Avoid argv exposure of secrets in process lists. Convex reads the
# omitted value from stdin.
printf '%s' "$jwks_uri" | convex_env AUTH_JWKS
printf '%s' "$secret" | convex_env CONVEX_SERVICE_SECRET

lgi_write_auth_status 0
echo "configure-convex-auth: set AUTH_ISSUER_URL, SITE_URL, AUTH_JWKS, CONVEX_SERVICE_SECRET on local Convex."
