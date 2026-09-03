import { z } from 'zod';

const required = z.string().min(1); // '' ≡ missing (truthiness call sites)
const verbatim = z.string(); // '' passes through (nullish / `===` call sites)

const REQUIRED_ENV = {
  DATABASE_URL: required,
  // Staging Preview only. Neon Connect injects production DATABASE_URL onto
  // Preview and custom-env deploys; these keys are not store-managed, so they
  // survive that injection. Empty ≡ missing — readEnv('DATABASE_URL') then
  // returns the real DATABASE_URL.
  LGI_DATABASE_URL: required,
  LGI_DATABASE_URL_UNPOOLED: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  ESI_SNAPSHOT_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,
  // Convex staging (and any Preview behind Vercel SSO) sends this as
  // x-vercel-protection-bypass on serviceFetch so token vend reaches the app.
  // Empty ≡ missing — serviceFetch only attaches the header when set.
  VERCEL_AUTOMATION_BYPASS_SECRET: required,
  CRON_SECRET: required,
  LINEAR_API_KEY: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
} as const;

const VERBATIM_ENV = {
  DATABASE_URL_UNPOOLED: verbatim,
  DATABASE_MIGRATION_URL: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  DOTENV_PATH: verbatim,
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  // Rate limiting (Vercel-KV-style names from the marketplace integration,
  // UPSTASH_* from a direct signup — rate-limit.ts accepts either)
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  GOOGLE_SITE_VERIFICATION: verbatim,
  VERCEL_ENV: verbatim,
  VERCEL_URL: verbatim,
  // Vercel injects these on hosted builds. Staging Preview uses them (plus
  // LGI_PREVIEW_LINE) to pick the standing Convex backend.
  VERCEL_GIT_COMMIT_REF: verbatim,
  VERCEL_TARGET_ENV: verbatim,
  LGI_PREVIEW_LINE: verbatim,
  NEXT_RUNTIME: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
  LGI_SITES_SAMPLE: verbatim,
  SDE_SEED_CACHE_DIR: verbatim,
} as const;

const SERVER_ENV = { ...REQUIRED_ENV, ...VERBATIM_ENV };

/** Server environment names whose absence is always a configuration error at the read boundary. */
export type RequiredEnvName = keyof typeof REQUIRED_ENV;
/** Closed registry of server environment names permitted through the shared env reader. */
export type ServerEnvName = RequiredEnvName | keyof typeof VERBATIM_ENV;

/**
 * Returns the validated value, or undefined when unset / empty-on-a-required-var.
 * The caller keeps its existing fallback branch (503 / 500-with-message / silent
 * no-op / `??` chain) — this only replaces the raw read.
 */
export function readEnv(name: ServerEnvName): string | undefined {
  if (name === 'DATABASE_URL' || name === 'DATABASE_URL_UNPOOLED') {
    const overrideName =
      name === 'DATABASE_URL' ? 'LGI_DATABASE_URL' : 'LGI_DATABASE_URL_UNPOOLED';
    const override = SERVER_ENV[overrideName].safeParse(process.env[overrideName]);
    if (override.success) return override.data;
  }
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Throwing read for sites where a missing var is a deployment error. Accepts
 * only REQUIRED keys: a verbatim key's empty value is meaningful, so the
 * `if (!value)` throw below would misfire on it — the type makes that a compile
 * error. The message matches the local helpers this replaces (auth,
 * eve-token-service, db scripts, …) byte-for-byte.
 */
export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Hosted Vercel production or preview. Local, CI `next start`, and `vercel dev` are not. */
export function isHostedVercel(): boolean {
  const vercelEnv = readEnv('VERCEL_ENV');
  return vercelEnv === 'production' || vercelEnv === 'preview';
}
