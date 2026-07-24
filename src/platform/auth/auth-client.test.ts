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
