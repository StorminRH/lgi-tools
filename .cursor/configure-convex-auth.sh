#!/usr/bin/env bash
# After Next and the anonymous local Convex backend are up, embed the live
# Better Auth JWKS into the Convex deployment and mirror SITE_URL / issuer /
# CONVEX_SERVICE_SECRET. Safe to re-run; does not print secret values.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export CONVEX_AGENT_MODE=anonymous
unset CONVEX_DEPLOY_KEY || true

env_val() { grep -E "^${1}=" .env.local 2>/dev/null | head -1 | cut -d= -f2-; }

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
  echo "configure-convex-auth: Next JWKS not ready; leaving placeholder AUTH_JWKS" >&2
  exit 0
fi

jwks_uri="data:text/plain;charset=utf-8;base64,$(printf '%s' "$jwks_json" | base64 -w0)"
printf '%s' "$jwks_uri" > /tmp/lgi-auth-jwks-uri
chmod 600 /tmp/lgi-auth-jwks-uri

secret="$(env_val CONVEX_SERVICE_SECRET)"
if [ -z "$secret" ]; then
  echo "configure-convex-auth: CONVEX_SERVICE_SECRET missing from .env.local" >&2
  exit 0
fi

# Do not pass `--deployment local` here: that flag talks to api.convex.dev
# and 401s without a login. The anonymous backend is selected by
# CONVEX_DEPLOYMENT=anonymous:anonymous-agent in .env.local.
convex_env() {
  pnpm exec convex env set "$@"
}

convex_env AUTH_ISSUER_URL http://localhost:3000
convex_env SITE_URL http://localhost:3000
# Avoid argv exposure of the data URI in process lists.
printf '%s' "$jwks_uri" | convex_env AUTH_JWKS
convex_env CONVEX_SERVICE_SECRET "$secret"

echo "configure-convex-auth: set AUTH_ISSUER_URL, SITE_URL, AUTH_JWKS, CONVEX_SERVICE_SECRET on local Convex."
