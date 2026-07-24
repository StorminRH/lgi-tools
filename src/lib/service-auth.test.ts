import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

import {
  bearerMatches,
  checkBearerSecret,
  requireBearerSecret,
  requireServiceAuth,
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
  it('returns a 500 problem naming the env var when the secret is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await requireBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CRON_SECRET');
    expect(res?.status).toBe(500);
    expect(problemBodySchema.parse(await res?.json())).toMatchObject({
      status: 500,
      code: 'not_configured',
      detail: 'CRON_SECRET not configured',
    });
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
    vi.stubEnv('CRON_SECRET', '');
    await expect(
      checkBearerSecret(makeRequest(`Bearer ${SECRET}`), 'CRON_SECRET'),
    ).resolves.toEqual({
      ok: false,
      failure: {
        category: 'unexpected',
        code: 'not_configured',
        cause: undefined,
        detail: 'CRON_SECRET not configured',
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

describe('requireServiceAuth', () => {
  it('authenticates against CONVEX_SERVICE_SECRET', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-only');
    expect(await requireServiceAuth(makeRequest('Bearer service-only'))).toBeNull();

    const denied = await requireServiceAuth(makeRequest(`Bearer ${SECRET}`));
    expect(denied?.status).toBe(401);
  });

  it('names CONVEX_SERVICE_SECRET in its unconfigured 500', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');
    const res = await requireServiceAuth(makeRequest('Bearer anything'));
    expect(res?.status).toBe(500);
    expect(problemBodySchema.parse(await res?.json())).toMatchObject({
      status: 500,
      code: 'not_configured',
      detail: 'CONVEX_SERVICE_SECRET not configured',
    });
  });
});
