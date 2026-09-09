LGI_LOCAL_DB_URL="postgres://lgi:lgi@localhost:5433/lgi_tools"
LGI_PG16_BIN="/usr/lib/postgresql/16/bin"
LGI_PLACEHOLDER_JWKS='data:text/plain;charset=utf-8;base64,e30='
LGI_AUTH_STATUS="/tmp/lgi-convex-auth.status"

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

lgi_selector_class() {
  local val="${1-}"
  if [ -z "$val" ]; then
    printf '%s' empty
    return 0
  fi
  local low
  low="$(printf '%s' "$val" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    anonymous:*) printf '%s' anonymous-selector ;;
    local:*) printf '%s' local-selector ;;
    prod:* | dev:* | preview:*) printf '%s' hosted-selector ;;
    *127.0.0.1* | *localhost*) printf '%s' loopback ;;
    *neon.tech*) printf '%s' hosted-neon ;;
    *.convex.cloud* | *.convex.site*) printf '%s' hosted-convex ;;
    data:*) printf '%s' data-uri ;;
    http://* | https://*) printf '%s' other-url ;;
    *) printf '%s' other ;;
  esac
}

lgi_is_hosted_db_class() {
  case "$1" in
    hosted-neon) return 0 ;;
    *) return 1 ;;
  esac
}

lgi_is_unsafe_convex_class() {
  case "$1" in
    hosted-selector | hosted-convex | local-selector | other-url | other) return 0 ;;
    *) return 1 ;;
  esac
}

lgi_forbidden_env_local_key() {
  case "$1" in
    EVE_CLIENT_ID | EVE_CLIENT_SECRET | NEXT_PUBLIC_CONVEX_URL | CONVEX_DEPLOYMENT) return 0 ;;
    *) return 1 ;;
  esac
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
  local dep_class url_class
  dep_class="$(lgi_selector_class "${CONVEX_DEPLOYMENT-}")"
  url_class="$(lgi_selector_class "${NEXT_PUBLIC_CONVEX_URL-}")"
  if lgi_is_unsafe_convex_class "$dep_class"; then
    echo "refusing non-anonymous CONVEX_DEPLOYMENT (class=${dep_class}); unsetting process selector" >&2
    unset CONVEX_DEPLOYMENT
  fi
  if [ "$url_class" != empty ] && [ "$url_class" != loopback ]; then
    echo "refusing non-loopback NEXT_PUBLIC_CONVEX_URL (class=${url_class}); unsetting process URL" >&2
    unset NEXT_PUBLIC_CONVEX_URL
  fi
}

lgi_require_anonymous_convex_file() {
  local file="${1:-.env.local}"
  local raw=""
  if [ -f "$file" ]; then
    raw="$(grep -E '^CONVEX_DEPLOYMENT=' "$file" | head -1 | cut -d= -f2- || true)"
  fi
  local class
  class="$(lgi_selector_class "$raw")"
  if lgi_is_unsafe_convex_class "$class"; then
    echo "ERROR: ${file} CONVEX_DEPLOYMENT is ${class}; refusing hosted/local Convex writes" >&2
    return 1
  fi
}

lgi_sde_ready_sql() {
  cat <<'SQL'
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM eve_data_meta WHERE key = 'sde_version' AND value <> '')
  AND (SELECT count(*) FROM type_dogma) > 0
  AND (SELECT count(*) FROM eve_npc_stations) > 0
  AND (SELECT count(*) FROM eve_system_jumps) > 0
  AND (SELECT count(*) FROM eve_types) > 0
  AND (SELECT count(*) FROM industry_blueprints) > 0
  AND (SELECT count(*) FROM blueprint_trees) > 0
THEN 1 ELSE 0 END;
SQL
}

lgi_sde_report() {
  local url="${1:-$LGI_LOCAL_DB_URL}"
  local bin
  bin="$(lgi_pg16_bin)"
  "$bin/psql" "$url" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT 'sde_version=' || COALESCE((SELECT value FROM eve_data_meta WHERE key = 'sde_version'), '');
SELECT 'type_dogma=' || (SELECT count(*)::text FROM type_dogma);
SELECT 'eve_npc_stations=' || (SELECT count(*)::text FROM eve_npc_stations);
SELECT 'eve_system_jumps=' || (SELECT count(*)::text FROM eve_system_jumps);
SELECT 'eve_types=' || (SELECT count(*)::text FROM eve_types);
SELECT 'industry_blueprints=' || (SELECT count(*)::text FROM industry_blueprints);
SELECT 'blueprint_trees=' || (SELECT count(*)::text FROM blueprint_trees);
SELECT 'market_prices=' || (SELECT count(*)::text FROM market_prices);
SELECT 'sites=' || (SELECT count(*)::text FROM sites);
SQL
}

lgi_sde_ready() {
  local url="${1:-$LGI_LOCAL_DB_URL}"
  local bin ready
  bin="$(lgi_pg16_bin)"
  ready="$("$bin/psql" "$url" -v ON_ERROR_STOP=1 -At -c "$(lgi_sde_ready_sql)")"
  [ "$ready" = 1 ]
}

lgi_write_auth_status() {
  printf '%s\n' "$1" > "$LGI_AUTH_STATUS"
}

lgi_stop_owned_postgres() {
  local bin="$1" data="$2" owned="$3"
  if [ "$owned" = 1 ]; then
    "$bin/pg_ctl" -D "$data" -w stop >/dev/null 2>&1 || true
  fi
}

lgi_eve_runtime_secret_presence() {
  if [ -n "${EVE_CLIENT_ID-}" ] && [ -n "${EVE_CLIENT_SECRET-}" ]; then
    echo "EVE runtime secrets: present"
  else
    echo "EVE runtime secrets: absent"
  fi
}
