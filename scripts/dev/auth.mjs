import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { validateJwks } from './jwks.mjs';

function readAnonymousDeployment(text) {
  const raw = parseEnv(text).CONVEX_DEPLOYMENT?.trim();
  if (!raw) throw new Error('Local Convex deployment is not configured in .env.local');
  const separator = raw.indexOf(':');
  const type = separator === -1 ? '' : raw.slice(0, separator);
  const name = separator === -1 ? raw : raw.slice(separator + 1);
  if (type !== 'anonymous' || !name.startsWith('anonymous-') || name.includes(':')) {
    throw new Error('Local Convex environment update requires an anonymous: deployment from the local backend');
  }
  return `${type}:${name}`;
}

function localConvexCliEnvironment(deployment, env = process.env) {
  const next = { ...env };
  next.CONVEX_DEPLOY_KEY = '';
  next.CONVEX_DEPLOYMENT_TOKEN = '';
  next.CONVEX_DEPLOYMENT = deployment;
  next.CONVEX_AGENT_MODE = 'anonymous';
  next.CONVEX_URL = '';
  next.CONVEX_SELF_HOSTED_URL = '';
  next.CONVEX_SELF_HOSTED_ADMIN_KEY = '';
  return next;
}

function localConvexEnvFailure(key, result, value) {
  let detail = [result.stderr, result.stdout, result.error?.message].filter(Boolean).join('\n');
  if (value) detail = detail.split(value).join('<redacted-value>');
  detail = detail
    .replace(/https?:\/\/dashboard\.convex\.dev\/\S+/g, 'https://dashboard.convex.dev/<path>')
    .replace(/anonymous-[A-Za-z0-9-]+\|[A-Za-z0-9]+/g, '<redacted-admin-key>')
    .replace(/\b[a-f0-9]{32,}\b/gi, '<redacted-hex>')
    .replace(/(SECRET|KEY|TOKEN|PASSWORD)=[^\s]+/gi, '$1=<redacted>')
    .trim();
  return `Local Convex environment update failed for ${key}${detail ? `: ${detail}` : ''}`;
}

function setLocalConvexEnv(key, value, deployment) {
  const result = spawnSync('pnpm', ['exec', 'convex', 'env', 'set', key], {
    input: value,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: localConvexCliEnvironment(deployment),
  });
  if (result.error || result.status !== 0) throw new Error(localConvexEnvFailure(key, result, value));
}

export async function configureAuth({ envFile = join(process.cwd(), '.env.local') } = {}) {
  const deployment = readAnonymousDeployment(readFileSync(envFile, 'utf8'));
  const secret = process.env.CONVEX_SERVICE_SECRET;
  if (!secret || secret.length < 32) throw new Error('CONVEX_SERVICE_SECRET must contain at least 32 characters');
  const response = await fetch('http://localhost:3000/api/auth/jwks', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Next JWKS endpoint is not ready');
  const jwks = validateJwks(await response.text());
  const values = { AUTH_ISSUER_URL: 'http://localhost:3000', SITE_URL: 'http://localhost:3000', AUTH_JWKS: jwks, CONVEX_SERVICE_SECRET: secret };
  for (const [key, value] of Object.entries(values)) setLocalConvexEnv(key, value, deployment);
}
