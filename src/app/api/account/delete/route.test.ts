import { beforeEach, expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';
import { rateLimitedFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const nukeAccountMock = vi.fn();
const logUsageEventMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/composition/account-lifecycle/account-purge', () => ({
  nukeAccount: (u: string) => nukeAccountMock(u),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (request: Request, options: unknown) =>
    checkRateLimitMock(request, options),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { postEmpty } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/account/delete';

beforeEach(() => {
  getSessionMock.mockReset();
  nukeAccountMock.mockReset();
  nukeAccountMock.mockResolvedValue(undefined);
  logUsageEventMock.mockReset();
  logUsageEventMock.mockResolvedValue(undefined);
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockResolvedValue({ ok: true });
});

test('refuses anonymous callers and nukes the signed-in account with an identity-free counter', async () => {
  getSessionMock.mockResolvedValue(null);
  const unauthenticated = await POST(postEmpty(ROUTE));
  expect(unauthenticated.status).toBe(401);
  expect(nukeAccountMock).not.toHaveBeenCalled();

  getSessionMock.mockResolvedValue(SESSION);
  const res = await POST(postEmpty(ROUTE));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(nukeAccountMock).toHaveBeenCalledWith('eve-user-1');
  expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  const logged = logUsageEventMock.mock.calls[0]![0];
  expect(logged).toEqual({ action: 'account_purge', metadata: { scope: 'account' } });
  expect(logged).not.toHaveProperty('characterId');
});

test('throttles before reading the session, then checks origin only after authorizing', async () => {
  getSessionMock.mockResolvedValue(SESSION);
  checkRateLimitMock.mockResolvedValueOnce({ ok: false, failure: rateLimitedFailure(11) });
  const throttled = await POST(postEmpty(ROUTE));
  expect(throttled.status).toBe(429);
  expect(throttled.headers.get('Retry-After')).toBe('11');
  expect(problemBodySchema.parse(await throttled.json())).toMatchObject({ code: 'rate_limited' });
  expect(checkRateLimitMock).toHaveBeenCalledWith(expect.any(Request), {
    name: 'account-delete',
    perMinute: 5,
  });
  expect(getSessionMock).not.toHaveBeenCalled();

  getSessionMock.mockResolvedValueOnce(null);
  const anonymous = await POST(postEmpty(ROUTE, { origin: 'https://foreign.example' }));
  expect(problemBodySchema.parse(await anonymous.json())).toMatchObject({
    status: 401,
    code: 'unauthenticated',
  });

  const crossOrigin = await POST(postEmpty(ROUTE, { origin: 'https://foreign.example' }));
  expect(problemBodySchema.parse(await crossOrigin.json())).toMatchObject({
    status: 403,
    code: 'cross_origin',
  });
  expect(getSessionMock).toHaveBeenCalledTimes(2);
  expect(nukeAccountMock).not.toHaveBeenCalled();
});
