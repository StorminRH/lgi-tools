import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

import { bearerMatches, checkBearerSecret } from './service-auth';

const SECRET = 'shared-secret';

function makeRequest(authorization?: string): Request {
  return new Request('http://localhost/api/internal/example', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
  vi.stubEnv('CRON_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('bearerMatches', () => {
  it('accepts the exact bearer and rejects everything else', () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(bearerMatches(`Bearer ${SECRET} `, SECRET)).toBe(false);
    expect(bearerMatches(SECRET, SECRET)).toBe(false);
    expect(bearerMatches(null, SECRET)).toBe(false);
  });
});

describe('checkBearerSecret', () => {
  it('returns typed failures and preserves successful admission', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('CRON_SECRET', '');
    await expect(
      checkBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CRON_SECRET'),
    ).resolves.toEqual({
      ok: false,
      failure: {
        category: 'unexpected',
        code: 'not_configured',
        cause: undefined,
        detail: 'service authentication is not configured',
      },
    });

    vi.stubEnv('CRON_SECRET', SECRET);
    await expect(checkBearerSecret(makeRequest(), 'CRON_SECRET')).resolves.toEqual({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    await expect(
      checkBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CRON_SECRET'),
    ).resolves.toEqual({ ok: true });
  });

  it('authenticates the internal service secret independently of the cron secret', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-only');
    await expect(
      checkBearerSecret(makeRequest('Bearer service-only'), 'CONVEX_SERVICE_SECRET'),
    ).resolves.toEqual({ ok: true });
    await expect(
      checkBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CONVEX_SERVICE_SECRET'),
    ).resolves.toEqual({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
  });
});
