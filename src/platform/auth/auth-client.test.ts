import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitedFailure } from '@/lib/failure';
import { problemBody } from '@/lib/problem';

const fetchMock = vi.fn();

describe('authClient OAuth failures', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', 'http://localhost:3000/api/auth');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('exposes a problem response through Better Fetch without throwing', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(problemBody(rateLimitedFailure(23), 'test-correlation-id')),
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            'Content-Type': 'application/problem+json',
            'Retry-After': '23',
          },
        },
      ),
    );

    const { authClient } = await import('./auth-client');
    const result = await authClient.signIn.oauth2({
      providerId: 'eve',
      callbackURL: '/',
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      status: 429,
      statusText: 'Too Many Requests',
      code: 'rate_limited',
      retryAfterSeconds: 23,
    });
  });
});

describe('fetchConvexAccessToken', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_AUTH_URL', 'http://localhost:3000/api/auth');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('mints from /token, reuses until forced refresh or logout, and returns null on anon or transport failure', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const first = `hdr.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig`;
    const second = `hdr.${Buffer.from(JSON.stringify({ exp: exp + 1 })).toString('base64url')}.sig`;
    fetchMock
      .mockResolvedValueOnce(Response.json({ token: first }))
      .mockResolvedValueOnce(Response.json({ token: second }))
      .mockImplementation(() => Promise.resolve(Response.json({ token: first })));

    const { fetchConvexAccessToken, clearCachedConvexAccessToken } = await import('./auth-client');

    await expect(fetchConvexAccessToken()).resolves.toBe(first);
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('/api/auth/token');
    await expect(fetchConvexAccessToken()).resolves.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(fetchConvexAccessToken({ forceRefreshToken: true })).resolves.toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    clearCachedConvexAccessToken();
    await expect(fetchConvexAccessToken()).resolves.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.resetModules();
    fetchMock.mockReset().mockResolvedValue(
      Response.json({ message: 'Unauthorized' }, { status: 401 }),
    );
    const anon = await import('./auth-client');
    await expect(anon.fetchConvexAccessToken()).resolves.toBeNull();

    vi.resetModules();
    fetchMock.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));
    const offline = await import('./auth-client');
    await expect(offline.fetchConvexAccessToken()).resolves.toBeNull();
  });
});
