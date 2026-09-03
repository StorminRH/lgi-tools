import { config as loadDotenv } from 'dotenv';
import { readFile } from 'node:fs/promises';

let dotenvLoaded = false;

function ensureBypassSecretFromEnvLocal() {
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || dotenvLoaded) return;
  loadDotenv({ path: process.env.DOTENV_PATH ?? '.env.local' });
  dotenvLoaded = true;
}

function vercelBypassHeaders(secret) {
  let resolved = secret;
  if (resolved === undefined) {
    ensureBypassSecretFromEnvLocal();
    resolved = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  if (!resolved) return undefined;
  return {
    'x-vercel-protection-bypass': resolved,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

export async function installOriginScopedBypass(context, targetOrigin, secret) {
  const headers = vercelBypassHeaders(secret);
  if (!headers) return false;
  let origin;
  try {
    origin = new URL(targetOrigin).origin;
  } catch {
    throw new Error('installOriginScopedBypass requires an absolute origin or URL');
  }
  await context.route(
    (url) => url.origin === origin,
    async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          ...headers,
        },
      });
    },
  );
  return true;
}

function requireCookieField(value, label) {
  if (value === undefined || value === '') throw new Error(`Cookie ${label} is missing`);
  return value;
}

function parseCookieExpiry(expires) {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return -1;
  return expiresAt;
}

function parseCookieLine(line) {
  const httpOnly = line.startsWith('#HttpOnly_');
  const normalizedLine = httpOnly ? line.slice('#HttpOnly_'.length) : line;
  const [domain, , path, secure, expires, name, value] = normalizedLine.split('\t');
  return {
    name: requireCookieField(name, 'name'),
    value: requireCookieField(value, 'value'),
    domain: requireCookieField(domain, 'domain'),
    path: requireCookieField(path, 'path'),
    secure: secure === 'TRUE',
    httpOnly,
    expires: parseCookieExpiry(expires),
  };
}

async function readNetscapeCookies(filePath) {
  if (!filePath) return [];
  const contents = await readFile(filePath, 'utf8');
  return contents
    .split('\n')
    .filter((line) => line.trim() !== '' && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
    .map(parseCookieLine);
}

export async function loadRemoteAuthOptions({ storageState = null, cookieJar = null } = {}) {
  ensureBypassSecretFromEnvLocal();
  return {
    storageState: storageState || undefined,
    cookies: await readNetscapeCookies(cookieJar),
    bypassConfigured: Boolean(vercelBypassHeaders()),
  };
}
