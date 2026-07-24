import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

import {
  bearerMatches,
  checkBearerSecret,
  requireBearerSecret,
} from './service-auth';

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

describe('requireBearerSecret', () => {
  it('returns a safe 500 problem and logs the missing env var server-side', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('CRON_SECRET', '');
    const res = await requireBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CRON_SECRET');
    expect(res?.status).toBe(500);
    expect(problemBodySchema.parse(await res?.json())).toMatchObject({
      status: 500,
      code: 'not_configured',
      detail: 'service authentication is not configured',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[service-auth] missing required environment variable',
      'CRON_SECRET',
    );
  });

  it('returns a 401 problem for a missing bearer', async () => {
    const res = await requireBearerSecret(makeRequest(), 'CRON_SECRET');
    expect(res?.status).toBe(401);
    expect(problemBodySchema.parse(await res?.json())).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
  });

  it('returns 401 for a wrong bearer', async () => {
    const res = await requireBearerSecret(makeRequest('Bearer nope'), 'CRON_SECRET');
    expect(res?.status).toBe(401);
  });

  it('returns null (proceed) for the right bearer', async () => {
    const res = await requireBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CRON_SECRET');
    expect(res).toBeNull();
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
});

describe('requireBearerSecret for internal service auth', () => {
  it('authenticates against CONVEX_SERVICE_SECRET', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-only');
    expect(
      await requireBearerSecret(
        makeRequest('Bearer service-only'),
        'CONVEX_SERVICE_SECRET',
      ),
    ).toBeNull();

    const denied = await requireBearerSecret(
      makeRequest(`Bearer ${SECRET}`),
      'CONVEX_SERVICE_SECRET',
    );
    expect(denied?.status).toBe(401);
  });

  it('keeps CONVEX_SERVICE_SECRET out of its unconfigured 500 body', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');
    const res = await requireBearerSecret(
      makeRequest('Bearer anything'),
      'CONVEX_SERVICE_SECRET',
    );
    expect(res?.status).toBe(500);
    expect(problemBodySchema.parse(await res?.json())).toMatchObject({
      status: 500,
      code: 'not_configured',
      detail: 'service authentication is not configured',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[service-auth] missing required environment variable',
      'CONVEX_SERVICE_SECRET',
    );
  });
});
