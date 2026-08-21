import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitedFailure } from '@/lib/failure';

const h = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));

import { rateLimitPreflight } from './rate-limit-preflight';

function request(): Request {
  return new Request('https://lgi.tools/api/example', { method: 'POST' });
}

describe('rateLimitPreflight', () => {
  beforeEach(() => {
    h.checkRateLimit.mockReset().mockResolvedValue({ ok: true });
  });

  it('returns null when the named bucket allows the request', async () => {
    const onLimited = vi.fn();
    const preflight = rateLimitPreflight(
      request(),
      { name: 'account-unlink', perMinute: 10 },
      onLimited,
    );

    await expect(preflight()).resolves.toBeNull();
    expect(onLimited).not.toHaveBeenCalled();
    expect(h.checkRateLimit).toHaveBeenCalledWith(expect.any(Request), {
      name: 'account-unlink',
      perMinute: 10,
    });
  });

  it('maps a denial through the route-owned 429 callback', async () => {
    const failure = rateLimitedFailure(12);
    h.checkRateLimit.mockResolvedValueOnce({ ok: false, failure });
    const denied = new Response(null, { status: 429 });
    const onLimited = vi.fn(() => denied);

    const result = await rateLimitPreflight(
      request(),
      { name: 'account-purge-character', perMinute: 10 },
      onLimited,
    )();

    expect(result).toBe(denied);
    expect(onLimited).toHaveBeenCalledWith(failure);
  });
});
