// Shared remote-access helpers for ux-check and verify:site-routes.
// Netscape cookie jars, Playwright storageState files, and Vercel Deployment
// Protection bypass headers. Node builtins + fs only — no Playwright import.

import { readFile } from 'node:fs/promises';

/**
 * Builds Playwright extraHTTPHeaders for Vercel Protection Bypass for Automation
 * when `VERCEL_AUTOMATION_BYPASS_SECRET` (or an explicit secret) is set.
 */
export function vercelBypassHeaders(secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  if (!secret) return undefined;
  return {
    'x-vercel-protection-bypass': secret,
    'x-vercel-set-bypass-cookie': 'true',
  };
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

/** Parses a Netscape-format cookie jar into Playwright `addCookies` objects. */
export async function readNetscapeCookies(filePath) {
  if (!filePath) return [];
  const contents = await readFile(filePath, 'utf8');
  return contents
    .split('\n')
    .filter((line) => line.trim() !== '' && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
    .map(parseCookieLine);
}

/**
 * Loads Playwright context auth options from optional storageState path and/or
 * Netscape cookie jar. Cookies from the jar are applied after context creation
 * by the caller via `context.addCookies`.
 */
export async function loadRemoteAuthOptions({ storageState = null, cookieJar = null } = {}) {
  return {
    storageState: storageState || undefined,
    cookies: await readNetscapeCookies(cookieJar),
    extraHTTPHeaders: vercelBypassHeaders(),
  };
}
