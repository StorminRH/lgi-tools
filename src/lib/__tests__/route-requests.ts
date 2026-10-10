/**
 * Request builders for route-handler tests. Every request targets
 * `http://localhost:3000{path}`, so redirects a route derives from `req.url`
 * stay absolute on that origin. A suite that mocks `next/server` must spread
 * the actual module into its factory so `NextRequest` stays real.
 */
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

/** Pair with `vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET)`. */
export const TEST_CRON_SECRET = 'test-secret';

/**
 * A string body is sent verbatim (malformed-JSON cases); anything else is
 * JSON.stringify'd. No Origin header is sent unless `origin` is given.
 */
export function postJson(
  path: string,
  body: unknown,
  {
    origin,
    authorization,
    headers,
  }: { origin?: string; authorization?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('content-type', 'application/json');
  if (origin) requestHeaders.set('origin', origin);
  if (authorization) requestHeaders.set('authorization', authorization);
  return new NextRequest(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: requestHeaders,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function postForm(path: string, fields: Record<string, string>): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

export function postEmpty(path: string): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, { method: 'POST' });
}

/** GET carrying the `Bearer TEST_CRON_SECRET` authorization a cron route checks. */
export function cronRequest(path: string): Request {
  return new Request(`${BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
  });
}
