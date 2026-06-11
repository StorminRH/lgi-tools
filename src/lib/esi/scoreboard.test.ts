import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-process stand-in for Upstash Redis with real expiry semantics, shared
// through one Map so assertions can inspect keys/TTLs directly. The `eval`
// case interprets the one Lua script the scoreboard uses (write-if-lower);
// its three behaviors (absent→set, higher→overwrite, lower→keep) are pinned
// by the echo tests below.
const h = vi.hoisted(() => {
  interface Entry {
    value: string;
    expiresAt: number | null;
  }
  type Cmd =
    | ['get', string]
    | ['set', string, string, { ex?: number } | undefined]
    | ['incr', string]
    | ['expire', string, number]
    | ['eval', string, string[], string[]];

  const store = new Map<string, Entry>();
  const ctorSpy = vi.fn();

  function isLive(entry: Entry | undefined): entry is Entry {
    return (
      entry !== undefined &&
      (entry.expiresAt === null || entry.expiresAt > Date.now())
    );
  }

  function getVal(key: string): string | null {
    const entry = store.get(key);
    if (!isLive(entry)) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  function setVal(key: string, value: string, exSeconds: number | null): void {
    store.set(key, {
      value: String(value),
      expiresAt: exSeconds !== null ? Date.now() + exSeconds * 1000 : null,
    });
  }

  function run(cmd: Cmd): unknown {
    switch (cmd[0]) {
      case 'get':
        return getVal(cmd[1]);
      case 'set': {
        const opts = cmd[3];
        setVal(cmd[1], cmd[2], typeof opts?.ex === 'number' ? opts.ex : null);
        return 'OK';
      }
      case 'incr': {
        const entry = store.get(cmd[1]);
        const live = isLive(entry);
        const next = live ? Number(entry.value) + 1 : 1;
        store.set(cmd[1], {
          value: String(next),
          // Redis INCR preserves an existing TTL.
          expiresAt: live ? entry.expiresAt : null,
        });
        return next;
      }
      case 'expire': {
        const entry = store.get(cmd[1]);
        if (!isLive(entry)) return 0;
        entry.expiresAt = Date.now() + cmd[2] * 1000;
        return 1;
      }
      case 'eval': {
        const [, , keys, args] = cmd;
        const current = getVal(keys[0]);
        if (current === null || Number(current) > Number(args[0])) {
          setVal(keys[0], args[0], Number(args[1]));
        }
        return 1;
      }
    }
  }

  class FakeRedis {
    constructor(opts: unknown) {
      ctorSpy(opts);
    }

    pipeline() {
      const cmds: Cmd[] = [];
      const p = {
        get(key: string) {
          cmds.push(['get', key]);
          return p;
        },
        set(key: string, value: string, opts?: { ex?: number }) {
          cmds.push(['set', key, value, opts]);
          return p;
        },
        incr(key: string) {
          cmds.push(['incr', key]);
          return p;
        },
        expire(key: string, seconds: number) {
          cmds.push(['expire', key, seconds]);
          return p;
        },
        eval(script: string, keys: string[], args: string[]) {
          cmds.push(['eval', script, keys, args]);
          return p;
        },
        async exec() {
          return cmds.map(run);
        },
      };
      return p;
    }

    async get(key: string): Promise<string | null> {
      return getVal(key);
    }
  }

  return { store, ctorSpy, FakeRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: h.FakeRedis }));

import {
  __resetScoreboardForTests,
  ESI_ERROR_CEILING,
  normalizeEsiPath,
  resolveScoreboard,
  type EsiReport,
  type EsiScoreboard,
} from './scoreboard';

const TEST_URL = 'https://esi.evetech.net/markets/10000002/orders/?type_id=34';
const BLOCK_KEY = 'lgi:esi:rl:block:/markets/{n}/orders';
const ECHO_KEY = 'lgi:esi:err:echo';

function makeReport(overrides: Partial<EsiReport>): EsiReport {
  return {
    url: TEST_URL,
    status: 200,
    errorLimitRemain: null,
    errorLimitReset: null,
    rateLimitGroup: null,
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitUsed: null,
    retryAfter: null,
    etagToStore: null,
    refreshEtag: null,
    ...overrides,
  };
}

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function seed(key: string, value: string): void {
  h.store.set(key, { value, expiresAt: null });
}

function redisScoreboard(): EsiScoreboard {
  // KV_* takes precedence, so stubbing it pins the client config even when a
  // `vercel env pull` left real credentials in the local env.
  vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
  vi.stubEnv('KV_REST_API_TOKEN', 'token');
  const sb = resolveScoreboard();
  if (sb === null) throw new Error('expected a Redis scoreboard');
  return sb;
}

describe('normalizeEsiPath', () => {
  it('collapses numeric segments and strips the trailing slash', () => {
    expect(normalizeEsiPath(TEST_URL)).toBe('/markets/{n}/orders');
    expect(
      normalizeEsiPath('https://esi.evetech.net/universe/types/34/'),
    ).toBe('/universe/types/{n}');
    expect(normalizeEsiPath('https://esi.evetech.net/')).toBe('/');
  });
});

describe('RedisScoreboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetScoreboardForTests();
    h.store.clear();
    h.ctorSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('constructs the client with raw values, a hard timeout, and no retries', () => {
    redisScoreboard();
    expect(h.ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.upstash.io',
        token: 'token',
        automaticDeserialization: false,
        retry: { retries: 0 },
        signal: expect.any(Function),
      }),
    );
  });

  it('combines the echo and the two-minute self-count pessimistically', async () => {
    const sb = redisScoreboard();
    seed(`lgi:esi:err:count:${currentMinute()}`, '30');
    seed(`lgi:esi:err:count:${currentMinute() - 1}`, '10');
    seed(ECHO_KEY, '70');

    const state = await sb.preDispatch(TEST_URL, false);
    // min(echo 70, 100 − 40) = 60
    expect(state.effectiveRemaining).toBe(60);

    seed(ECHO_KEY, '50');
    const lower = await sb.preDispatch(TEST_URL, false);
    expect(lower.effectiveRemaining).toBe(50);
  });

  it('reports a full budget when nothing is stored', async () => {
    const sb = redisScoreboard();
    const state = await sb.preDispatch(TEST_URL, true);
    expect(state).toEqual({
      effectiveRemaining: ESI_ERROR_CEILING,
      blockedRetryAfter: null,
      etag: null,
    });
  });

  it('surfaces an active Retry-After block for the normalized route', async () => {
    const sb = redisScoreboard();
    seed(BLOCK_KEY, '30');
    const state = await sb.preDispatch(TEST_URL, false);
    expect(state.blockedRetryAfter).toBe(30);
  });

  it('returns stored ETag meta only when asked', async () => {
    const sb = redisScoreboard();
    seed(
      `lgi:esi:etag:meta:${TEST_URL}`,
      JSON.stringify({ etag: '"abc"', expires: 'E', contentType: 'ct' }),
    );

    const wanted = await sb.preDispatch(TEST_URL, true);
    expect(wanted.etag).toEqual({ etag: '"abc"', expires: 'E', contentType: 'ct' });

    const unwanted = await sb.preDispatch(TEST_URL, false);
    expect(unwanted.etag).toBeNull();
  });

  it('counts every non-2xx/3xx response with a 120s TTL', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 404 }));
    await sb.report(makeReport({ status: 503 }));

    const key = `lgi:esi:err:count:${currentMinute()}`;
    expect(h.store.get(key)?.value).toBe('2');
    expect(h.store.get(key)?.expiresAt).toBe(Date.now() + 120_000);
  });

  it('still counts errors that carry token-bucket headers (conservative rule)', async () => {
    // The docs leave it ambiguous whether errors on token-bucket routes
    // deplete the legacy per-IP limit; under-counting risks the ban, so the
    // mirror counts them.
    const sb = redisScoreboard();
    await sb.report(
      makeReport({
        status: 404,
        rateLimitGroup: 'market-orders',
        rateLimitLimit: 12_000,
      }),
    );
    expect(h.store.get(`lgi:esi:err:count:${currentMinute()}`)?.value).toBe('1');
  });

  it('does not count 2xx/3xx responses as errors', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200, errorLimitRemain: 95 }));
    await sb.report(makeReport({ status: 304 }));
    expect(h.store.get(`lgi:esi:err:count:${currentMinute()}`)).toBeUndefined();
  });

  it('echoes the lowest observed Remain and never lets a higher value reopen it', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200, errorLimitRemain: 50, errorLimitReset: 60 }));
    expect(h.store.get(ECHO_KEY)?.value).toBe('50');
    expect(h.store.get(ECHO_KEY)?.expiresAt).toBe(Date.now() + 60_000);

    await sb.report(makeReport({ status: 200, errorLimitRemain: 80 }));
    expect(h.store.get(ECHO_KEY)?.value).toBe('50');

    await sb.report(makeReport({ status: 200, errorLimitRemain: 30 }));
    expect(h.store.get(ECHO_KEY)?.value).toBe('30');
  });

  it('accepts a higher Remain after the echo window expires (fresh truth)', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200, errorLimitRemain: 50, errorLimitReset: 60 }));
    vi.advanceTimersByTime(61_000);
    await sb.report(makeReport({ status: 200, errorLimitRemain: 80, errorLimitReset: 60 }));
    expect(h.store.get(ECHO_KEY)?.value).toBe('80');
  });

  it('forces the echo to zero on a 420, ignoring the stale Remain header', async () => {
    const sb = redisScoreboard();
    await sb.report(
      makeReport({ status: 420, errorLimitRemain: 50, errorLimitReset: 30 }),
    );
    expect(h.store.get(ECHO_KEY)?.value).toBe('0');
    expect(h.store.get(ECHO_KEY)?.expiresAt).toBe(Date.now() + 30_000);
    // A 420 is itself a non-2xx/3xx response — it counts.
    expect(h.store.get(`lgi:esi:err:count:${currentMinute()}`)?.value).toBe('1');
  });

  it('writes a Retry-After block on 429, defaulting and clamping the duration', async () => {
    const sb = redisScoreboard();

    await sb.report(makeReport({ status: 429 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe('60');
    expect(h.store.get(BLOCK_KEY)?.expiresAt).toBe(Date.now() + 60_000);

    await sb.report(makeReport({ status: 429, retryAfter: 7200 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe('3600');

    await sb.report(makeReport({ status: 429, retryAfter: 30 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe('30');
  });

  it('stores per-group token-bucket state for the sync engine to read', async () => {
    const sb = redisScoreboard();
    await sb.report(
      makeReport({
        status: 200,
        rateLimitGroup: 'market-orders',
        rateLimitLimit: 12_000,
        rateLimitRemaining: 11_990,
        rateLimitUsed: 10,
      }),
    );

    const entry = h.store.get('lgi:esi:rl:group:market-orders');
    expect(entry).toBeDefined();
    expect(JSON.parse(entry!.value)).toEqual({
      limit: 12_000,
      remaining: 11_990,
      used: 10,
      observedAt: Date.now(),
    });
    expect(entry!.expiresAt).toBe(Date.now() + 1_200_000);
  });

  it('stores ETag meta and body together and serves the body back', async () => {
    const sb = redisScoreboard();
    await sb.report(
      makeReport({
        status: 200,
        etagToStore: {
          etag: '"abc"',
          expires: 'E',
          contentType: 'application/json',
          body: '{"a":1}',
        },
      }),
    );

    expect(JSON.parse(h.store.get(`lgi:esi:etag:meta:${TEST_URL}`)!.value)).toEqual({
      etag: '"abc"',
      expires: 'E',
      contentType: 'application/json',
    });
    expect(h.store.get(`lgi:esi:etag:body:${TEST_URL}`)?.value).toBe('{"a":1}');
    expect(h.store.get(`lgi:esi:etag:body:${TEST_URL}`)?.expiresAt).toBe(
      Date.now() + 172_800_000,
    );
    await expect(sb.getCachedBody(TEST_URL)).resolves.toBe('{"a":1}');
  });

  it('refreshes meta and the body TTL on a 304 revalidation', async () => {
    const sb = redisScoreboard();
    await sb.report(
      makeReport({
        status: 200,
        etagToStore: { etag: '"abc"', expires: 'E1', contentType: 'ct', body: 'B' },
      }),
    );
    vi.advanceTimersByTime(60_000);
    await sb.report(
      makeReport({
        status: 304,
        refreshEtag: { etag: '"abc"', expires: 'E2', contentType: 'ct' },
      }),
    );

    expect(JSON.parse(h.store.get(`lgi:esi:etag:meta:${TEST_URL}`)!.value).expires).toBe('E2');
    expect(h.store.get(`lgi:esi:etag:body:${TEST_URL}`)?.expiresAt).toBe(
      Date.now() + 172_800_000,
    );
  });

  it('returns null for a missing cached body', async () => {
    const sb = redisScoreboard();
    await expect(sb.getCachedBody(TEST_URL)).resolves.toBeNull();
  });

  it('memoizes the client per URL', () => {
    expect(redisScoreboard()).toBe(redisScoreboard());
    expect(h.ctorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveScoreboard fallback selection', () => {
  beforeEach(() => {
    __resetScoreboardForTests();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('falls back to a working in-process scoreboard outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const sb = resolveScoreboard();
    expect(sb).not.toBeNull();

    // Full round trip on the same semantics as the Redis implementation.
    await sb!.report(makeReport({ status: 420 }));
    const closed = await sb!.preDispatch(TEST_URL, false);
    expect(closed.effectiveRemaining).toBe(0);

    await sb!.report(makeReport({ status: 429, retryAfter: 30 }));
    const blocked = await sb!.preDispatch(TEST_URL, false);
    expect(blocked.blockedRetryAfter).toBe(30);

    await sb!.report(
      makeReport({
        status: 200,
        etagToStore: { etag: '"abc"', expires: null, contentType: null, body: 'B' },
      }),
    );
    const withEtag = await sb!.preDispatch(TEST_URL, true);
    expect(withEtag.etag?.etag).toBe('"abc"');
    await expect(sb!.getCachedBody(TEST_URL)).resolves.toBe('B');

    // Singleton: state persists across resolves.
    expect(resolveScoreboard()).toBe(sb);
  });

  it('returns null in production and logs the misconfiguration once', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(resolveScoreboard()).toBeNull();
    expect(resolveScoreboard()).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
