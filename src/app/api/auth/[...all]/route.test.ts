import { beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

const { betterAuthGetMock, betterAuthPostMock, checkRateLimitMock, mergeTracking, afterMock, getSessionMock, checkAuthorizationsMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  getSessionMock: vi.fn(),
  checkAuthorizationsMock: vi.fn(),
  betterAuthGetMock: vi.fn(),
  betterAuthPostMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  mergeTracking: { merged: false },
}));

vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('@/composition/character-authorization', () => ({
  checkUserCharacterAuthorizations: checkAuthorizationsMock,
}));

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({
    GET: betterAuthGetMock,
    POST: betterAuthPostMock,
  }),
}));

vi.mock('@/composition/auth', () => ({
  auth: {
    api: { getSession: getSessionMock },
    $context: Promise.resolve({
      authCookies: {
        sessionData: { name: 'better-auth.session_data', attributes: {} },
        accountData: { name: 'better-auth.account_data', attributes: {} },
        dontRememberToken: { name: 'better-auth.dont_remember', attributes: {} },
      },
    }),
  },
}));
vi.mock('@/platform/auth/merge-context', () => ({
  runWithMergeTracking: async (fn: () => Promise<Response>) => ({
    result: await fn(),
    merged: mergeTracking.merged,
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

import { GET, POST } from './route';

describe('POST /api/auth/[...all]', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    betterAuthPostMock.mockReset();
  });

  it('serializes OAuth entry throttling as the shared problem response', async () => {
    checkRateLimitMock.mockResolvedValue({
      ok: false,
      failure: {
        category: 'rate_limited',
        code: 'rate_limited',
        retryAfterSeconds: 19,
      },
    });

    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-in/oauth2', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('Retry-After')).toBe('19');
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 19,
    });
    expect(betterAuthPostMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/[...all]', () => {
  beforeEach(() => {
    betterAuthGetMock.mockReset();
    afterMock.mockReset();
    getSessionMock.mockReset();
    checkAuthorizationsMock.mockReset();
    mergeTracking.merged = false;
  });

  it.each([null, { user: { id: 'returning-user' } }])('checks returning client sessions after responding: %j', async (session) => {
    const request = new Request('http://localhost:3000/api/auth/get-session', {
      headers: { cookie: 'better-auth.session_token=returning' },
    });
    const response = Response.json(session);
    betterAuthGetMock.mockResolvedValue(response);
    getSessionMock.mockResolvedValue(session);
    await expect(GET(request)).resolves.toBe(response);
    expect(afterMock).toHaveBeenCalledOnce();
    expect(getSessionMock).not.toHaveBeenCalled();
    await afterMock.mock.calls[0]![0]();
    expect(getSessionMock).toHaveBeenCalledExactlyOnceWith({ headers: request.headers });
    if (session) expect(checkAuthorizationsMock).toHaveBeenCalledExactlyOnceWith('returning-user');
    else expect(checkAuthorizationsMock).not.toHaveBeenCalled();
  });

  it('returns the Better Auth response untouched when the callback merged nothing', async () => {
    const response = new Response(null, { status: 302, headers: { location: '/settings/characters' } });
    betterAuthGetMock.mockResolvedValue(response);
    await expect(GET(new Request('http://localhost:3000/api/auth/oauth2/callback/eve'))).resolves.toBe(response);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('expires the cached-session cookies on a merged callback and keeps the redirect and its cookies', async () => {
    mergeTracking.merged = true;
    const headers = new Headers({ location: '/settings/characters' });
    headers.append('set-cookie', 'better-auth.state=; Max-Age=0; Path=/');
    betterAuthGetMock.mockResolvedValue(new Response(null, { status: 302, headers }));

    const response = await GET(
      new Request('http://localhost:3000/api/auth/oauth2/callback/eve', {
        headers: { cookie: 'better-auth.session_data.0=x; better-auth.session_token=t' },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/settings/characters');
    expect(response.headers.getSetCookie()).toEqual([
      'better-auth.state=; Max-Age=0; Path=/',
      'better-auth.session_data=; Max-Age=0; Path=/',
      'better-auth.session_data.0=; Max-Age=0; Path=/',
      'better-auth.account_data=; Max-Age=0; Path=/',
      'better-auth.dont_remember=; Max-Age=0; Path=/',
    ]);
  });
});
