import { spawnSync } from 'node:child_process';
import { validateJwks } from './jwks.mjs';

export async function configureAuth() {
  const secret = process.env.CONVEX_SERVICE_SECRET;
  if (!secret || secret.length < 32) throw new Error('CONVEX_SERVICE_SECRET must contain at least 32 characters');
  const response = await fetch('http://localhost:3000/api/auth/jwks', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Next JWKS endpoint is not ready');
  const jwks = validateJwks(await response.text());
  const values = { AUTH_ISSUER_URL: 'http://localhost:3000', SITE_URL: 'http://localhost:3000', AUTH_JWKS: jwks, CONVEX_SERVICE_SECRET: secret };
  for (const [key, value] of Object.entries(values)) {
    const result = spawnSync('pnpm', ['exec', 'convex', 'env', 'set', '--deployment', 'local', key], { input: value, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    if (result.error || result.status !== 0) throw new Error(`Local Convex environment update failed for ${key}`);
  }
}
