import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

import { requireBearerSecret, requireCronAuth, swallow } from './cron';

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

describe('requireCronAuth', () => {
  it('admits Vercel’s cron bearer and rejects everything else', async () => {
    expect(await requireCronAuth(makeRequest(`Bearer ${SECRET}`))).toBeNull();
    expect((await requireCronAuth(makeRequest('Bearer nope')))?.status).toBe(401);
    expect((await requireCronAuth(makeRequest()))?.status).toBe(401);
  });

  it('checks CRON_SECRET rather than the service secret', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-only');
    expect(await requireCronAuth(makeRequest('Bearer cron-only'))).toBeNull();
    expect((await requireCronAuth(makeRequest(`Bearer ${SECRET}`)))?.status).toBe(401);
  });
});

describe('swallow', () => {
  it('awaits the side effect and returns normally when it resolves', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let landed = false;
    await swallow('[test]', Promise.resolve().then(() => { landed = true; }));
    expect(landed).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs and swallows a rejection so observability cannot break the cron', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('telemetry down');
    await expect(swallow('[test]', Promise.reject(boom))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[test]', boom);
  });
});
