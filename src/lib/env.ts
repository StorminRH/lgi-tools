import { z } from 'zod';

const required = z.string().min(1);
const verbatim = z.string();

const REQUIRED_ENV = {
  DATABASE_URL: required,

  LGI_DATABASE_URL: required,
  LGI_DATABASE_URL_UNPOOLED: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  ESI_SNAPSHOT_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,

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

  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  GOOGLE_SITE_VERIFICATION: verbatim,
  VERCEL_ENV: verbatim,
  VERCEL_URL: verbatim,

  VERCEL_GIT_COMMIT_REF: verbatim,
  VERCEL_TARGET_ENV: verbatim,
  LGI_PREVIEW_LINE: verbatim,
  NEXT_RUNTIME: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
  LGI_SITES_SAMPLE: verbatim,
  SDE_SEED_CACHE_DIR: verbatim,
} as const;

const SERVER_ENV = { ...REQUIRED_ENV, ...VERBATIM_ENV };

export type RequiredEnvName = keyof typeof REQUIRED_ENV;

export type ServerEnvName = RequiredEnvName | keyof typeof VERBATIM_ENV;

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

export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function isHostedVercel(): boolean {
  const vercelEnv = readEnv('VERCEL_ENV');
  return vercelEnv === 'production' || vercelEnv === 'preview';
}
