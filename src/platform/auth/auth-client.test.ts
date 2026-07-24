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

  it('mints a token from the jwt plugin endpoint for a signed-in caller', async () => {
    fetchMock.mockResolvedValue(Response.json({ token: 'es256-jwt' }));

    const { fetchConvexAccessToken } = await import('./auth-client');

    await expect(fetchConvexAccessToken()).resolves.toBe('es256-jwt');
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('/api/auth/token');
  });

  it('returns null when the caller is anonymous', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { fetchConvexAccessToken } = await import('./auth-client');

    await expect(fetchConvexAccessToken()).resolves.toBeNull();
  });

  it('returns null rather than rejecting when the mint request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { fetchConvexAccessToken } = await import('./auth-client');

    await expect(fetchConvexAccessToken()).resolves.toBeNull();
  });
});
