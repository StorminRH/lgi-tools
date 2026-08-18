import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

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
        JSON.stringify(
          problemBodySchema.parse({
            type: 'https://lgi.tools/problems/rate_limited',
            title: 'Too many requests',
            status: 429,
            code: 'rate_limited',
            correlationId: 'test-correlation-id',
            retryAfterSeconds: 23,
          }),
        ),
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

// Executable contract evidence for the jwt client plugin against the installed
// better-auth: the real client issues the mint request and the bridge helper
// maps its outcomes to Convex's null-on-failure contract.
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
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const anon = await import('./auth-client');
    await expect(anon.fetchConvexAccessToken()).resolves.toBeNull();

    vi.resetModules();
    fetchMock.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));
    const offline = await import('./auth-client');
    await expect(offline.fetchConvexAccessToken()).resolves.toBeNull();
  });
});
