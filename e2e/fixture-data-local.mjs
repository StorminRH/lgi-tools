const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function requireLocalUrl(value, label, protocols = ['http:', 'https:']) {
  let url;
  try { url = new URL(value); } catch {
    throw new Error(`E2E_PREREQUISITE: ${label} must be an explicit local URL`);
  }
  if (!protocols.includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`E2E_PREREQUISITE: ${label} must target loopback; hosted fixture mutation is forbidden`);
  }
  return url;
}

/** @param {string} baseURL @param {Record<string, string | undefined>} env */
export function requireLocalAuthEnvironment(baseURL, env = process.env) {
  const app = requireLocalUrl(baseURL, 'E2E_BASE_URL');
  const auth = requireLocalUrl(env.BETTER_AUTH_URL ?? baseURL, 'BETTER_AUTH_URL');
  if (app.origin !== auth.origin) throw new Error('E2E_PREREQUISITE: auth and app origins must match');
  requireLocalUrl(env.LGI_DATABASE_URL || env.DATABASE_URL, 'DATABASE_URL', ['postgres:', 'postgresql:']);
  if (env.LOCAL_DB_DRIVER !== 'postgres-js') {
    throw new Error('E2E_PREREQUISITE: LOCAL_DB_DRIVER=postgres-js is required for local PostgreSQL');
  }
  if (!(env.BETTER_AUTH_SECRET || env.SESSION_SECRET)) {
    throw new Error('E2E_PREREQUISITE: a matching local auth secret is required');
  }
  return app;
}

/** @param {Record<string, string | undefined>} env */
export function requireLocalConvexEnvironment(env = process.env) {
  const deployment = env.CONVEX_DEPLOYMENT ?? '';
  if (!/^(local|anonymous):[a-zA-Z0-9_-]+$/.test(deployment)) {
    throw new Error('E2E_PREREQUISITE: Convex requires a local: or anonymous: deployment');
  }
  requireLocalUrl(env.NEXT_PUBLIC_CONVEX_URL, 'NEXT_PUBLIC_CONVEX_URL');
  if (env.CONVEX_URL) requireLocalUrl(env.CONVEX_URL, 'CONVEX_URL');
  for (const key of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY']) {
    if (env[key]) throw new Error(`E2E_PREREQUISITE: remove ${key} before local fixture operations`);
  }
  if (!env.CONVEX_SERVICE_SECRET) throw new Error('E2E_PREREQUISITE: local CONVEX_SERVICE_SECRET is required');
}
