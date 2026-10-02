# Shared helpers for the Claude Code cloud environment. Sourced, not run.
LGI_LOCAL_DB_URL="postgres://lgi:lgi@localhost:5433/lgi_tools"
LGI_PG16_BIN="/usr/lib/postgresql/16/bin"
# Machine state outside the checkout, so the setup-script snapshot keeps it
# while every session starts from a fresh clone.
LGI_STATE_DIR="${LGI_STATE_DIR:-$HOME/.local/share/lgi}"
# Postgres refuses to run as root, which cloud sessions are, so the cluster
# belongs to the image's postgres user.
LGI_PGDATA="${LGI_PGDATA:-/var/lib/lgi-pgdata}"
LGI_PG_LOG="$LGI_PGDATA/server.log"
LGI_ENV_LOCAL_STATE="$LGI_STATE_DIR/env.local"
LGI_PROVISIONED_MARKER="$LGI_STATE_DIR/provisioned"
LGI_LOG_DIR="${LGI_LOG_DIR:-/tmp/lgi}"
LGI_STACK_STATUS="${LGI_STACK_STATUS:-$LGI_LOG_DIR/stack.status}"
LGI_PLACEHOLDER_JWKS='data:text/plain;charset=utf-8;base64,e30='
LGI_AUTH_STATUS="${LGI_AUTH_STATUS:-/tmp/lgi-convex-auth.status}"
LGI_ANONYMOUS_DEPLOYMENT="anonymous:anonymous-agent"
LGI_CONVEX_PORT=3210
LGI_SDE_COUNT_TABLES=(
  type_dogma
  eve_npc_stations
  eve_system_jumps
  eve_types
  industry_blueprints
  blueprint_trees
  market_prices
  sites
)

lgi_pg16_bin() {
  if [ ! -x "${LGI_PG16_BIN}/pg_ctl" ]; then
    echo "ERROR: PostgreSQL 16 is required at ${LGI_PG16_BIN}" >&2
    return 1
  fi
  printf '%s' "$LGI_PG16_BIN"
}

lgi_ensure_pg16() {
  if [ -x "${LGI_PG16_BIN}/pg_ctl" ]; then
    return 0
  fi
  sudo apt-get update -q
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-16 postgresql-client-16
  lgi_pg16_bin >/dev/null
}

lgi_url_parts() {
  python3 -c '
import sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
if not u.scheme or not u.netloc:
    raise SystemExit(2)
host = (u.hostname or "").lower()
port = "" if u.port is None else str(u.port)
userinfo = "1" if (u.username or u.password) else "0"
print("\t".join([
    u.scheme.lower(),
    host,
    port,
    userinfo,
    u.path or "",
    u.query or "",
    u.fragment or "",
]))
' "$1"
}

lgi_selector_class() {
  local val="${1-}"
  if [ -z "$val" ]; then
    printf '%s' empty
    return 0
  fi
  local low
  low="$(printf '%s' "$val" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    anonymous:anonymous-agent) printf '%s' anonymous-selector; return 0 ;;
    anonymous:*) printf '%s' other; return 0 ;;
    local:*) printf '%s' local-selector; return 0 ;;
    prod:* | dev:* | preview:*) printf '%s' hosted-selector; return 0 ;;
    data:*) printf '%s' data-uri; return 0 ;;
  esac
  local parts host
  if parts="$(lgi_url_parts "$val" 2>/dev/null)"; then
    host="$(printf '%s' "$parts" | cut -f2)"
    case "$host" in
      localhost | 127.0.0.1) printf '%s' loopback; return 0 ;;
      neon.tech | *.neon.tech) printf '%s' hosted-neon; return 0 ;;
      *.convex.cloud | *.convex.site) printf '%s' hosted-convex; return 0 ;;
    esac
    printf '%s' other-url
    return 0
  fi
  printf '%s' other
}

lgi_is_hosted_db_class() {
  case "$1" in
    hosted-neon) return 0 ;;
    *) return 1 ;;
  esac
}

lgi_is_anonymous_deployment() {
  [ "${1-}" = "$LGI_ANONYMOUS_DEPLOYMENT" ]
}

lgi_is_convex_loopback_url() {
  local parts scheme host port userinfo path query frag
  parts="$(lgi_url_parts "$1" 2>/dev/null)" || return 1
  scheme="$(printf '%s' "$parts" | cut -f1)"
  host="$(printf '%s' "$parts" | cut -f2)"
  port="$(printf '%s' "$parts" | cut -f3)"
  userinfo="$(printf '%s' "$parts" | cut -f4)"
  path="$(printf '%s' "$parts" | cut -f5)"
  query="$(printf '%s' "$parts" | cut -f6)"
  frag="$(printf '%s' "$parts" | cut -f7)"
  [ "$scheme" = http ] || return 1
  [ "$host" = localhost ] || [ "$host" = 127.0.0.1 ] || return 1
  [ "$port" = "$LGI_CONVEX_PORT" ] || return 1
  [ "$userinfo" = 0 ] || return 1
  [ -z "$path" ] || [ "$path" = / ] || return 1
  [ -z "$query" ] || return 1
  [ -z "$frag" ] || return 1
}

lgi_forbidden_env_local_key() {
  case "$1" in
    EVE_CLIENT_ID | EVE_CLIENT_SECRET | NEXT_PUBLIC_CONVEX_URL | CONVEX_DEPLOYMENT) return 0 ;;
    *) return 1 ;;
  esac
}

lgi_file_env_val() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- || true
}

lgi_strip_empty_env_local_key() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  if [ -z "$(lgi_file_env_val "$file" "$key")" ]; then
    sed -i "/^${key}=/d" "$file"
  fi
}

lgi_clear_empty_process_selector() {
  if [ -z "${CONVEX_DEPLOYMENT-}" ]; then
    unset CONVEX_DEPLOYMENT
  fi
  if [ -z "${NEXT_PUBLIC_CONVEX_URL-}" ]; then
    unset NEXT_PUBLIC_CONVEX_URL
  fi
}

lgi_pin_local_db_env() {
  export DATABASE_URL="$LGI_LOCAL_DB_URL"
  export DATABASE_URL_UNPOOLED="$LGI_LOCAL_DB_URL"
  export DATABASE_MIGRATION_URL="$LGI_LOCAL_DB_URL"
  unset LGI_DATABASE_URL || true
  unset LGI_DATABASE_URL_UNPOOLED || true
}

lgi_run_local_db() {
  env \
    DATABASE_URL="$LGI_LOCAL_DB_URL" \
    DATABASE_URL_UNPOOLED="$LGI_LOCAL_DB_URL" \
    DATABASE_MIGRATION_URL="$LGI_LOCAL_DB_URL" \
    "$@"
}

lgi_pin_anonymous_convex_env() {
  export CONVEX_AGENT_MODE=anonymous
  unset CONVEX_DEPLOY_KEY || true
  lgi_clear_empty_process_selector
  if [ -n "${CONVEX_DEPLOYMENT-}" ] && ! lgi_is_anonymous_deployment "$CONVEX_DEPLOYMENT"; then
    echo "ERROR: refusing non-anonymous CONVEX_DEPLOYMENT (class=$(lgi_selector_class "$CONVEX_DEPLOYMENT"))" >&2
    return 1
  fi
  if [ -n "${NEXT_PUBLIC_CONVEX_URL-}" ] && ! lgi_is_convex_loopback_url "$NEXT_PUBLIC_CONVEX_URL"; then
    echo "ERROR: refusing non-loopback NEXT_PUBLIC_CONVEX_URL (class=$(lgi_selector_class "$NEXT_PUBLIC_CONVEX_URL"))" >&2
    return 1
  fi
}

lgi_require_anonymous_convex_file() {
  local file="${1:-.env.local}"
  local dep url
  dep="$(lgi_file_env_val "$file" CONVEX_DEPLOYMENT)"
  url="$(lgi_file_env_val "$file" NEXT_PUBLIC_CONVEX_URL)"
  if [ -n "$dep" ] && ! lgi_is_anonymous_deployment "$dep"; then
    echo "ERROR: ${file} CONVEX_DEPLOYMENT is $(lgi_selector_class "$dep"); need ${LGI_ANONYMOUS_DEPLOYMENT} or empty" >&2
    return 1
  fi
  if [ -n "$url" ] && ! lgi_is_convex_loopback_url "$url"; then
    echo "ERROR: ${file} NEXT_PUBLIC_CONVEX_URL is $(lgi_selector_class "$url"); need loopback :${LGI_CONVEX_PORT}" >&2
    return 1
  fi
}

lgi_sde_ready_sql() {
  local t sql
  sql="SELECT CASE WHEN
  EXISTS (SELECT 1 FROM eve_data_meta WHERE key = 'sde_version' AND value <> '')"
  for t in "${LGI_SDE_COUNT_TABLES[@]}"; do
    sql="$sql
  AND (SELECT count(*) FROM ${t}) > 0"
  done
  printf '%s\n' "$sql
THEN 1 ELSE 0 END;"
}

lgi_sde_report() {
  local url="${1:-$LGI_LOCAL_DB_URL}"
  local bin t
  bin="$(lgi_pg16_bin)"
  "$bin/psql" "$url" -v ON_ERROR_STOP=1 -At -c \
    "SELECT 'sde_version=' || COALESCE((SELECT value FROM eve_data_meta WHERE key = 'sde_version'), '');"
  for t in "${LGI_SDE_COUNT_TABLES[@]}"; do
    "$bin/psql" "$url" -v ON_ERROR_STOP=1 -At -c \
      "SELECT '${t}=' || (SELECT count(*)::text FROM ${t});"
  done
}

lgi_sde_ready() {
  local url="${1:-$LGI_LOCAL_DB_URL}"
  local bin ready
  bin="$(lgi_pg16_bin)"
  ready="$("$bin/psql" "$url" -v ON_ERROR_STOP=1 -At -c "$(lgi_sde_ready_sql)")"
  [ "$ready" = 1 ]
}

lgi_jwks_has_signing_keys() {
  printf '%s' "${1-}" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    raise SystemExit(1)
if not isinstance(data, dict):
    raise SystemExit(1)
keys = data.get("keys")
if not isinstance(keys, list) or not keys:
    raise SystemExit(1)
ok = 0
for key in keys:
    if not isinstance(key, dict):
        continue
    kty = key.get("kty")
    if kty == "EC" and key.get("crv") and key.get("x") and key.get("y"):
        ok += 1
    elif kty == "RSA" and key.get("n") and key.get("e"):
        ok += 1
    elif kty == "OKP" and key.get("crv") and key.get("x"):
        ok += 1
if ok == 0:
    raise SystemExit(1)
'
}

lgi_write_auth_status() {
  printf '%s\n' "$1" > "$LGI_AUTH_STATUS"
}

lgi_require_auth_ready() {
  if [ ! -f "$LGI_AUTH_STATUS" ]; then
    echo "ERROR: convex auth status missing (${LGI_AUTH_STATUS})" >&2
    return 1
  fi
  local st
  st="$(tr -d '[:space:]' < "$LGI_AUTH_STATUS")"
  if [ "$st" != 0 ]; then
    echo "ERROR: convex auth reconcile failed (status=${st})" >&2
    return 1
  fi
}

# Run a server-side Postgres binary as the cluster owner.
lgi_pg_server() {
  if [ "$(id -u)" = 0 ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

lgi_stop_owned_postgres() {
  local bin="$1" data="$2" owned="$3"
  if [ "$owned" = 1 ]; then
    lgi_pg_server "$bin/pg_ctl" -D "$data" -w stop >/dev/null 2>&1 || true
  fi
}

lgi_eve_runtime_secret_presence() {
  if [ -n "${EVE_CLIENT_ID-}" ] && [ -n "${EVE_CLIENT_SECRET-}" ]; then
    echo "EVE runtime secrets: present"
  else
    echo "EVE runtime secrets: absent"
  fi
}

lgi_wait_for_postgres() {
  local bin
  bin="$(lgi_pg16_bin)"
  for _ in $(seq 1 60); do
    if "$bin/pg_isready" -h localhost -p 5433 -U lgi -d lgi_tools >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: postgres did not become ready on :5433" >&2
  return 1
}

# Generated secrets must outlive the fresh clone each session starts from;
# rotating EVE_TOKEN_ENCRYPTION_KEY would orphan every stored token.
lgi_restore_env_local() {
  local file="${1:-.env.local}"
  if [ ! -f "$file" ] && [ -f "$LGI_ENV_LOCAL_STATE" ]; then
    cp "$LGI_ENV_LOCAL_STATE" "$file"
  fi
}

lgi_save_env_local() {
  local file="${1:-.env.local}"
  mkdir -p "$LGI_STATE_DIR"
  install -m 600 "$file" "$LGI_ENV_LOCAL_STATE"
}

# A crashed `convex dev` leaves its local backend reparented to init, still
# holding :3210, and the next run refuses the occupied port. Only orphans are
# stopped; a backend under a live `convex dev` keeps its parent.
lgi_stop_orphan_convex_backend() {
  local pid
  for pid in $(pgrep -f -- "convex-local-backend --port $LGI_CONVEX_PORT" || true); do
    if [ "$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" = 1 ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

lgi_port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}
