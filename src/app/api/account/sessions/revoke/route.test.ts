import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitedFailure } from '@/lib/failure';

// The route logs the caller out everywhere (revokes all their sessions). Mock auth +
// the revoke query so these exercise the session gate + the act-on-self wiring.

const SESSION = {
  user: { id: 'eve-user-1' },
  session: {},
  characterId: 100,
  name: 'Alice',
  portraitUrl: 'a',
  role: 'USER' as const,
  isAdmin: false,
};

const getSessionMock = vi.fn();
const revokeUserSessionsMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/admin-users', () => ({
  revokeUserSessions: (u: string) => revokeUserSessionsMock(u),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { POST } from './route';

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/sessions/revoke', { method: 'POST' });
}

describe('POST /api/account/sessions/revoke', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    revokeUserSessionsMock.mockReset();
    checkRateLimitMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('returns the rate-limit response before reading the session', async () => {
    checkRateLimitMock.mockResolvedValue({
      ok: false,
      failure: rateLimitedFailure(10),
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(await res.json()).toMatchObject({
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 10,
    });
    expect(checkRateLimitMock).toHaveBeenCalledWith(expect.any(Request), {
      name: 'account-logout-everywhere',
      perMinute: 10,
    });
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
  });

  it('revokes the caller\'s own sessions and returns the count', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    revokeUserSessionsMock.mockResolvedValue(3);
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 3 });
    expect(revokeUserSessionsMock).toHaveBeenCalledWith('eve-user-1');
  });
});
