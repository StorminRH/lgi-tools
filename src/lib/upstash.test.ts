import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisCtorSpy = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(opts: unknown) {
      redisCtorSpy(opts);
    }

    async get(key: string): Promise<string> {
      return `value:${key}`;
    }

    async fails(): Promise<never> {
      throw new Error('redis down');
    }

    pipeline(): { get: () => unknown; exec: () => Promise<string[]> } {
      const builder = {
        get: () => builder,
        exec: async () => ['piped'],
      };
      return builder;
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

  it('uses the first complete pair and does not mix KV URL with Upstash token', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://direct.example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'direct-token');
    const { resolveUpstashRest } = await importUpstash();

    expect(resolveUpstashRest()).toEqual({
      url: 'https://direct.example.upstash.io',
      token: 'direct-token',
    });
  });

  it('returns null when neither pair is complete', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'orphan-token');
    const { resolveUpstashRest } = await importUpstash();

    expect(resolveUpstashRest()).toBeNull();
  });
});

describe('allowUnconfiguredUpstash', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows degradation outside hosted Vercel', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', '');
    const { allowUnconfiguredUpstash } = await importUpstash();
    expect(allowUnconfiguredUpstash()).toBe(true);
  });

  it('allows degradation under production next start when VERCEL_ENV is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    const { allowUnconfiguredUpstash } = await importUpstash();
    expect(allowUnconfiguredUpstash()).toBe(true);
  });

  it('stays fail-closed on hosted Vercel production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { allowUnconfiguredUpstash } = await importUpstash();
    expect(allowUnconfiguredUpstash()).toBe(false);
  });

  it('stays fail-closed on hosted Vercel preview', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { allowUnconfiguredUpstash } = await importUpstash();
    expect(allowUnconfiguredUpstash()).toBe(false);
  });
});

describe('Redis command timing', () => {
  beforeEach(() => {
    vi.resetModules();
    redisCtorSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function timedClient() {
    const { createUpstashClient } = await importUpstash();
    const { setDependencyTimingSink } = await import('./dependency-timing');
    const recorded: Array<[string, number]> = [];
    setDependencyTimingSink((kind, ms) => {
      recorded.push([kind, ms]);
    });
    const client = createUpstashClient({
      url: 'https://example.upstash.io',
      token: 'token',
      timeoutMs: 1_000,
      retries: 0,
    }) as unknown as {
      get: (key: string) => Promise<string>;
      fails: () => Promise<never>;
      pipeline: () => { get: () => unknown; exec: () => Promise<string[]> };
    };
    return { client, recorded, setDependencyTimingSink };
  }

  it('records one redis timing per command and returns the real value', async () => {
    const { client, recorded } = await timedClient();

    await expect(client.get('k')).resolves.toBe('value:k');

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.[0]).toBe('redis');
    expect(recorded[0]?.[1]).toBeGreaterThanOrEqual(0);
  });

  it('records a failed command and still rejects for the caller', async () => {
    const { client, recorded } = await timedClient();

    await expect(client.fails()).rejects.toThrow('redis down');

    expect(recorded.map(([kind]) => kind)).toEqual(['redis']);
  });

  it('times a pipeline on exec rather than on each chained command', async () => {
    const { client, recorded } = await timedClient();

    const pipeline = client.pipeline();
    pipeline.get();
    pipeline.get();
    expect(recorded).toEqual([]);

    await expect(pipeline.exec()).resolves.toEqual(['piped']);
    expect(recorded.map(([kind]) => kind)).toEqual(['redis']);
  });
});
