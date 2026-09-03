import { beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

const { betterAuthGetMock, betterAuthPostMock, checkRateLimitMock } = vi.hoisted(() => ({
  betterAuthGetMock: vi.fn(),
  betterAuthPostMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({
    GET: betterAuthGetMock,
    POST: betterAuthPostMock,
  }),
}));

vi.mock('@/composition/account-lifecycle/register-owner-reconciler', () => ({}));
vi.mock('@/composition/auth', () => ({ auth: {} }));
vi.mock('@/platform/auth/absorb-context', () => ({
  runWithAbsorbTracking: vi.fn(),
}));
vi.mock('@/platform/auth/absorb-redirect', () => ({
  decorateAbsorbRedirect: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

import { POST } from './route';

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
