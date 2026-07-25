import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisCtorSpy = vi.fn();

// The factory is the only module that constructs the vendor client, so the
// vendor package is mocked at its import site. Class form because the factory
// invokes it with `new`.
vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(opts: unknown) {
      redisCtorSpy(opts);
    }
  },
}));

async function importUpstash() {
  return await import('./upstash');
}

function lastConfig(): {
  url: string;
  token: string;
  automaticDeserialization: boolean | undefined;
  signal: () => AbortSignal;
  retry: { retries: number };
} {
  return redisCtorSpy.mock.calls.at(-1)?.[0];
}

describe('createUpstashClient', () => {
  beforeEach(() => {
    vi.resetModules();
    redisCtorSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('passes the explicit timeout signal and retry count to the vendor client', async () => {
    const { createUpstashClient } = await importUpstash();

    createUpstashClient({
      url: 'https://example.upstash.io',
      token: 'token',
      timeoutMs: 2000,
      retries: 1,
    });

    const config = lastConfig();
    expect(config.url).toBe('https://example.upstash.io');
    expect(config.token).toBe('token');
    expect(config.retry).toEqual({ retries: 1 });
    expect(typeof config.signal).toBe('function');
  });

  it('leaves automaticDeserialization undefined so the SDK default is preserved', async () => {
    const { createUpstashClient } = await importUpstash();

    createUpstashClient({
      url: 'https://example.upstash.io',
      token: 'token',
      timeoutMs: 2000,
      retries: 0,
    });

    // The SDK deserializes unless the option is explicitly false, so omitting
    // the field must not silently disable it.
    expect(lastConfig().automaticDeserialization).toBeUndefined();
  });

  it('forwards an explicit automaticDeserialization: false for raw-string stores', async () => {
    const { createUpstashClient } = await importUpstash();

    createUpstashClient({
      url: 'https://example.upstash.io',
      token: 'token',
      timeoutMs: 1500,
      retries: 0,
      automaticDeserialization: false,
    });

    expect(lastConfig().automaticDeserialization).toBe(false);
  });

  it('returns a fresh signal per request that aborts with TimeoutError at the bound', async () => {
    vi.useFakeTimers();
    const { createUpstashClient } = await importUpstash();

    createUpstashClient({
      url: 'https://example.upstash.io',
      token: 'token',
      timeoutMs: 2000,
      retries: 0,
    });

    const { signal } = lastConfig();
    const first = signal();
    const second = signal();
    // A shared signal would abort every later request once the first timed out.
    expect(first).not.toBe(second);
    expect(first.aborted).toBe(false);

    vi.advanceTimersByTime(1999);
    expect(first.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(first.aborted).toBe(true);
    expect((first.reason as DOMException).name).toBe('TimeoutError');

    vi.useRealTimers();
  });
});

describe('resolveUpstashClient', () => {
  beforeEach(() => {
    vi.resetModules();
    redisCtorSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns null when Upstash is unconfigured so callers keep their degradation', async () => {
    const { resolveUpstashClient } = await importUpstash();

    expect(resolveUpstashClient({ timeoutMs: 2000, retries: 0 })).toBeNull();
    expect(redisCtorSpy).not.toHaveBeenCalled();
  });

  it('builds a bounded client from the resolved credentials', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    const { resolveUpstashClient } = await importUpstash();

    expect(resolveUpstashClient({ timeoutMs: 2000, retries: 0 })).not.toBeNull();

    const config = lastConfig();
    expect(config.url).toBe('https://example.upstash.io');
    expect(config.token).toBe('token');
    expect(config.retry).toEqual({ retries: 0 });
  });

  it('prefers the Vercel marketplace credential pair', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'kv-token');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://direct.example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'direct-token');
    const { resolveUpstashClient } = await importUpstash();

    resolveUpstashClient({ timeoutMs: 2000, retries: 0 });

    expect(lastConfig().url).toBe('https://kv.example.upstash.io');
  });
});

describe('resolveUpstashRest', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires a complete credential pair', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    const { resolveUpstashRest } = await importUpstash();

    expect(resolveUpstashRest()).toBeNull();
  });
});
