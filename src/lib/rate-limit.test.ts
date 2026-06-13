import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limitMock = vi.fn();
const redisCtorSpy = vi.fn();

// Mock Upstash before importing the helper. The helper does
// `new Redis({ url, token })`; we never need the constructed instance to
// do anything, only to exist so the `Ratelimit` constructor doesn't throw.
// Class form (not vi.fn) because the helper invokes it with `new`.
vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(opts: unknown) {
      redisCtorSpy(opts);
    }
  },
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    function MockRatelimit() {
      return { limit: limitMock };
    },
    {
      slidingWindow: vi.fn(() => ({ kind: 'sliding-window' })),
    },
  ),
}));

async function importHelper() {
  return await import('./rate-limit');
}

describe('rateLimit', () => {
  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns ok with finite remaining when the limiter says success', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NODE_ENV', 'production');
    limitMock.mockResolvedValue({
      success: true,
      remaining: 4,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });

    const { rateLimit } = await importHelper();
    const result = await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(result).toEqual({ ok: true, remaining: 4 });
  });

  it('returns denied with retryAfter rounded up to next whole second', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NODE_ENV', 'production');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    limitMock.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: now + 12_300, // 12.3s away
      pending: Promise.resolve(),
    });

    const { rateLimit } = await importHelper();
    const result = await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(result).toEqual({ ok: false, retryAfter: 13 });
  });

  it('clamps retryAfter to at least 1 second when reset has already passed', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NODE_ENV', 'production');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    limitMock.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: now - 5_000,
      pending: Promise.resolve(),
    });

    const { rateLimit } = await importHelper();
    const result = await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(result).toEqual({ ok: false, retryAfter: 1 });
  });

  it('awaits the pending analytics promise before returning', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NODE_ENV', 'production');
    let analyticsResolved = false;
    const pending = new Promise<void>((resolve) => {
      setTimeout(() => {
        analyticsResolved = true;
        resolve();
      }, 10);
    });
    limitMock.mockResolvedValue({
      success: true,
      remaining: 3,
      reset: Date.now() + 60_000,
      pending,
    });

    const { rateLimit } = await importHelper();
    await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(analyticsResolved).toBe(true);
  });

  it('bypasses the limiter in development when env vars are unset', async () => {
    // Stub both env-var pairs to empty — without this, a `KV_*` value pulled
    // into the local env (from `vercel env pull`) would flip the limiter
    // from bypass to live-call and the test would silently exercise the
    // wrong path.
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'development');

    const { rateLimit } = await importHelper();
    const result = await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(result.ok).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('bypasses the limiter in test when env vars are unset', async () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'test');

    const { rateLimit } = await importHelper();
    const result = await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(result.ok).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('throws in production when env vars are unset (fail-closed)', async () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'production');

    const { rateLimit } = await importHelper();
    await expect(
      rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 }),
    ).rejects.toThrow(/UPSTASH_REDIS_REST_URL|KV_REST_API_URL/);
  });

  it('reads KV_REST_API_URL / KV_REST_API_TOKEN (Vercel marketplace naming)', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'kv-token');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'production');
    limitMock.mockResolvedValue({
      success: true,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });

    const { rateLimit } = await importHelper();
    const result = await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });
    expect(result).toEqual({ ok: true, remaining: 9 });
  });

  it('prefers KV_REST_API_* over UPSTASH_REDIS_REST_* when both are set', async () => {
    redisCtorSpy.mockReset();
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'kv-token');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');
    vi.stubEnv('NODE_ENV', 'production');
    limitMock.mockResolvedValue({
      success: true,
      remaining: 4,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });

    const { rateLimit } = await importHelper();
    await rateLimit('1.2.3.4', { name: 'feedback', perMinute: 5 });

    expect(redisCtorSpy).toHaveBeenCalledWith({
      url: 'https://kv.example.upstash.io',
      token: 'kv-token',
    });
  });
});

describe('clientIdentifier', () => {
  it('prefers the platform-set x-real-ip over a client-controllable x-forwarded-for', async () => {
    const { clientIdentifier } = await importHelper();
    const headers = new Headers({
      'x-real-ip': '198.51.100.7',
      'x-forwarded-for': '203.0.113.5, 10.0.0.1',
    });
    expect(clientIdentifier(headers)).toBe('198.51.100.7');
  });

  it('falls back to the first x-forwarded-for IP when x-real-ip is missing', async () => {
    const { clientIdentifier } = await importHelper();
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(clientIdentifier(headers)).toBe('203.0.113.5');
  });

  it('falls back to "unknown" when neither header is present', async () => {
    const { clientIdentifier } = await importHelper();
    expect(clientIdentifier(new Headers())).toBe('unknown');
  });
});
