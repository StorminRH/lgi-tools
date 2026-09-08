import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const databaseKeys = ['LGI_DATABASE_URL', 'LGI_DATABASE_URL_UNPOOLED', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_MIGRATION_URL'];
const localDatabaseUrl = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

export function effectiveEnvironment(root, inherited = process.env) {
  const merged = {};
  for (const name of ['.env', '.env.development', '.env.local', '.env.development.local']) {
    const path = `${root}/${name}`;
    if (existsSync(path)) Object.assign(merged, parseEnv(readFileSync(path, 'utf8')));
  }
  return { ...merged, ...inherited };
}

export function assertLocalEnvironment(env) {
  for (const key of databaseKeys) {
    if (!env[key]) continue;
    let url;
    try { url = new URL(env[key]); } catch { throw new Error(`${key} must be a local PostgreSQL URL`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.port !== '5433' || url.pathname !== '/lgi_tools'
      || url.username !== 'lgi' || url.search || url.hash) {
      throw new Error(`${key} must target the local lgi_tools database on port 5433 without URL options`);
    }
  }
  if (env.DOTENV_PATH && env.DOTENV_PATH !== '.env.local') throw new Error('DOTENV_PATH must be .env.local for development bootstrap');
  if (env.LOCAL_DB_DRIVER && env.LOCAL_DB_DRIVER !== 'postgres-js') throw new Error('LOCAL_DB_DRIVER must be postgres-js');
  if (env.BETTER_AUTH_URL && env.BETTER_AUTH_URL !== 'http://localhost:3000') throw new Error('BETTER_AUTH_URL must be http://localhost:3000');
}

export function localProcessEnvironment(root, inherited = process.env) {
  const env = effectiveEnvironment(root, inherited);
  assertLocalEnvironment(env);
  for (const key of databaseKeys) env[key] = localDatabaseUrl;
  Object.assign(env, { LOCAL_DB_DRIVER: 'postgres-js', DOTENV_PATH: '.env.local',
    CONVEX_AGENT_MODE: 'anonymous', CONVEX_DEPLOYMENT: '', CONVEX_DEPLOY_KEY: '',
    CONVEX_URL: '', CONVEX_SELF_HOSTED_URL: '', CONVEX_SELF_HOSTED_ADMIN_KEY: '',
    NEXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210',
    BETTER_AUTH_URL: 'http://localhost:3000', AUTH_ISSUER_URL: 'http://localhost:3000', SITE_URL: 'http://localhost:3000' });
  return env;
}

export function prepareEnvironment(root) {
  assertLocalEnvironment(effectiveEnvironment(root));
  const path = `${root}/.env.local`;
  const env = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
  for (const key of databaseKeys) env[key] = localDatabaseUrl;
  Object.assign(env, { LOCAL_DB_DRIVER: 'postgres-js', BETTER_AUTH_URL: 'http://localhost:3000', CONVEX_AGENT_MODE: 'anonymous', NEXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210' });
  for (const key of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_URL', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'AUTH_JWKS']) delete env[key];
  for (const key of ['SESSION_SECRET', 'BETTER_AUTH_SECRET', 'EVE_TOKEN_ENCRYPTION_KEY', 'ESI_SNAPSHOT_ENCRYPTION_KEY', 'CRON_SECRET', 'CONVEX_SERVICE_SECRET']) {
    if (!env[key]) env[key] = randomBytes(32).toString('hex');
  }
  writeFileSync(path, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
}
