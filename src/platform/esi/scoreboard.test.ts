import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const execs = { count: 0 };

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

  function incrVal(key: string): number {
    const entry = store.get(key);
    const live = isLive(entry);
    const next = live ? Number(entry.value) + 1 : 1;
    store.set(key, {
      value: String(next),
      expiresAt: live ? entry.expiresAt : null,
    });
    return next;
  }

  function expireVal(key: string, seconds: number): number {
    const entry = store.get(key);
    if (!isLive(entry)) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  function evalLowerOrSet(keys: string[], args: string[]): number {
    const current = getVal(keys[0]!);
    if (current === null || Number(current) > Number(args[0])) {
      setVal(keys[0]!, args[0]!, Number(args[1]));
    }
    return 1;
  }

  function run(cmd: Cmd): unknown {
    switch (cmd[0]) {
      case 'get':
        return getVal(cmd[1]);
      case 'set': {
        const ex = cmd[3]?.ex;
        setVal(cmd[1], cmd[2], typeof ex === 'number' ? ex : null);
        return 'OK';
      }
      case 'incr':
        return incrVal(cmd[1]);
      case 'expire':
        return expireVal(cmd[1], cmd[2]);
      case 'eval':
        return evalLowerOrSet(cmd[2], cmd[3]);
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
          execs.count += 1;
          return cmds.map(run);
        },
      };
      return p;
    }

    async mget(...keys: string[]): Promise<(string | null)[]> {
      return keys.map(getVal);
    }
  }

  return { store, ctorSpy, execs, FakeRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: h.FakeRedis }));

import {
  __resetScoreboardForTests,
  NO_RESPONSE_STATUS,
  normalizeEsiPath,
  readEsiAvailabilitySnapshot,
  readEsiBudgetSnapshot,
  resolveScoreboard,
  type EsiReport,
  type EsiScoreboard,
} from './scoreboard';
import { ESI_ERROR_CEILING } from './scoreboard/types';

const TEST_URL = 'https://esi.evetech.net/markets/10000002/orders/?type_id=34';
const BLOCK_KEY = 'lgi:esi:rl:block:/markets/{n}/orders';
const ECHO_KEY = 'lgi:esi:err:echo';

function makeReport(overrides: Partial<EsiReport>): EsiReport {
  return {
    url: TEST_URL,
    status: 200,
    errorLimitRemain: null,
    errorLimitReset: null,
    retryAfter: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    ...overrides,
  };
}

const HISTORY_URL = 'https://esi.evetech.net/markets/10000002/history/?type_id=34';
const INDUSTRY_URL = 'https://esi.evetech.net/industry/systems/';
const FACILITIES_URL = 'https://esi.evetech.net/industry/facilities/';
const GROUP_OF_ORDERS = 'lgi:esi:rl:group-of:/markets/{n}/orders';

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function seed(key: string, value: string): void {
  h.store.set(key, { value, expiresAt: null });
}

function redisScoreboard(): EsiScoreboard {
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

    const state = await sb.preDispatch(TEST_URL);
    expect(state.effectiveRemaining).toBe(60);

    seed(ECHO_KEY, '50');
    const lower = await sb.preDispatch(TEST_URL);
    expect(lower.effectiveRemaining).toBe(50);
  });

  it('reports a full budget when nothing is stored', async () => {
    const sb = redisScoreboard();
    const state = await sb.preDispatch(TEST_URL);
    expect(state).toEqual({
      effectiveRemaining: ESI_ERROR_CEILING,
      blockedRetryAfter: null,
    });
  });

  it('reads the global budget without consulting route state', async () => {
    const sb = redisScoreboard();
    seed(`lgi:esi:err:count:${currentMinute()}`, '35');
    seed(`lgi:esi:err:count:${currentMinute() - 1}`, '10');
    seed(ECHO_KEY, '70');

    await expect(sb.budgetSnapshot()).resolves.toEqual({
      effectiveRemaining: 55,
      selfCount: 45,
      echo: 70,
      source: 'shared',
    });
  });

  it('surfaces the seconds remaining on an active Retry-After block', async () => {
    const sb = redisScoreboard();
    seed(BLOCK_KEY, String(Math.floor(Date.now() / 1000) + 30));
    const state = await sb.preDispatch(TEST_URL);
    expect(state.blockedRetryAfter).toBe(30);

    seed(BLOCK_KEY, String(Math.floor(Date.now() / 1000) - 5));
    const expired = await sb.preDispatch(TEST_URL);
    expect(expired.blockedRetryAfter).toBeNull();
  });

  it('reads only the budget and the route block before a dispatch', async () => {
    const sb = redisScoreboard();
    seed('lgi:esi:etag:meta:/markets/10000002/orders/?type_id=34', '{"etag":"\"abc\""}');

    const state = await sb.preDispatch(TEST_URL);
    expect(state).toEqual({ effectiveRemaining: ESI_ERROR_CEILING, blockedRetryAfter: null });
  });

  it('counts every non-2xx/3xx response with a 120s TTL', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 404 }));
    await sb.report(makeReport({ status: 503 }));

    const key = `lgi:esi:err:count:${currentMinute()}`;
    expect(h.store.get(key)?.value).toBe('2');
    expect(h.store.get(key)?.expiresAt).toBe(Date.now() + 120_000);
  });

  it('counts every dispatched call per minute, and the ones ESI failed, for just over an hour', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200 }));
    await sb.report(makeReport({ status: 304 }));
    await sb.report(makeReport({ status: 404 }));
    await sb.report(makeReport({ status: 420 }));
    await sb.report(makeReport({ status: 429 }));
    await sb.report(makeReport({ status: 503 }));
    await sb.report(makeReport({ status: NO_RESPONSE_STATUS }));

    const minute = currentMinute();
    expect(h.store.get(`lgi:esi:call:count:${minute}`)?.value).toBe('7');
    expect(h.store.get(`lgi:esi:fail:count:${minute}`)?.value).toBe('4');
    expect(h.store.get(`lgi:esi:call:count:${minute}`)?.expiresAt).toBe(Date.now() + 65 * 60_000);
  });

  it('sums the last sixty minute buckets into the availability snapshot', async () => {
    const minute = currentMinute();
    seed(`lgi:esi:call:count:${minute}`, '3');
    seed(`lgi:esi:fail:count:${minute}`, '1');
    seed(`lgi:esi:call:count:${minute - 59}`, '5');
    seed(`lgi:esi:call:count:${minute - 60}`, '100');
    seed(`lgi:esi:fail:count:${minute - 60}`, '100');
    redisScoreboard();
    await expect(readEsiAvailabilitySnapshot()).resolves.toEqual({
      calls: 8,
      failures: 1,
      source: 'shared',
    });
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
    expect(h.store.get(`lgi:esi:err:count:${currentMinute()}`)?.value).toBe('1');
  });

  it('writes a Retry-After block on 429, defaulting and clamping the duration', async () => {
    const sb = redisScoreboard();
    const nowSec = Math.floor(Date.now() / 1000);

    await sb.report(makeReport({ status: 429 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe(String(nowSec + 60));
    expect(h.store.get(BLOCK_KEY)?.expiresAt).toBe(Date.now() + 60_000);

    await sb.report(makeReport({ status: 429, retryAfter: 7200 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe(String(nowSec + 3600));

    await sb.report(makeReport({ status: 429, retryAfter: 30 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe(String(nowSec + 30));
  });

  it('writes only the call count for a plain success without error-limit headers', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200 }));
    expect([...h.store.keys()]).toEqual([`lgi:esi:call:count:${currentMinute()}`]);
  });

  it('writes nothing for an ETag or a body: a 304 counts only as a call', async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200 }));
    await sb.report(makeReport({ status: 304 }));
    expect([...h.store.keys()]).toEqual([`lgi:esi:call:count:${currentMinute()}`]);
  });

  it('memoizes the client per URL', () => {
    expect(redisScoreboard()).toBe(redisScoreboard());
    expect(h.ctorSpy).toHaveBeenCalledTimes(1);
  });

  it("learns a path's group from its headers and echoes the group's lowest Remaining beside its limit for 60s", async () => {
    const sb = redisScoreboard();
    await sb.report(makeReport({ status: 200, rlGroup: 'market-order', rlLimit: 12000, rlRemaining: 500 }));
    expect(h.store.get(GROUP_OF_ORDERS)).toEqual({ value: 'market-order', expiresAt: Date.now() + 86_400_000 });
    expect(h.store.get('lgi:esi:rl:group:market-order:remaining')).toEqual({ value: '500', expiresAt: Date.now() + 60_000 });
    expect(h.store.get('lgi:esi:rl:group:market-order:limit')).toEqual({ value: '12000', expiresAt: Date.now() + 60_000 });

    await sb.report(makeReport({ status: 304, rlGroup: 'market-order', rlLimit: 12000, rlRemaining: 900 }));
    expect(h.store.get('lgi:esi:rl:group:market-order:remaining')?.value).toBe('500');
    await sb.report(makeReport({ status: 200, rlGroup: 'market-order', rlLimit: 12000, rlRemaining: 300 }));

    const state = await sb.preDispatch(TEST_URL);
    expect(state.groupBudget).toEqual({ group: 'market-order', remaining: 300, limit: 12000 });
    expect(state.historyCalls).toBeUndefined();

    vi.advanceTimersByTime(61_000);
    expect((await sb.preDispatch(TEST_URL)).groupBudget).toBeUndefined();
    await sb.report(makeReport({ status: 200, rlGroup: 'market-order', rlLimit: 12000, rlRemaining: 11000 }));
    expect((await sb.preDispatch(TEST_URL)).groupBudget).toEqual({ group: 'market-order', remaining: 11000, limit: 12000 });
  });

  it('reads a path\'s group from the shared mapping it has not seen itself, in a second trip once', async () => {
    seed(GROUP_OF_ORDERS, 'market-order');
    seed('lgi:esi:rl:group:market-order:remaining', '40');
    seed('lgi:esi:rl:group:market-order:limit', '12000');
    const sb = redisScoreboard();
    h.execs.count = 0;

    expect((await sb.preDispatch(TEST_URL)).groupBudget).toEqual({ group: 'market-order', remaining: 40, limit: 12000 });
    expect(h.execs.count).toBe(2);
    expect((await sb.preDispatch(TEST_URL)).groupBudget).toEqual({ group: 'market-order', remaining: 40, limit: 12000 });
    expect(h.execs.count).toBe(3);

    expect((await sb.preDispatch(INDUSTRY_URL)).groupBudget).toBeUndefined();
    expect(h.execs.count).toBe(4);
  });

  it('blocks the group a 429 names, for every path in it, and only the path when it names none', async () => {
    const sb = redisScoreboard();
    const nowSec = Math.floor(Date.now() / 1000);
    await sb.report(makeReport({ url: FACILITIES_URL, status: 200, rlGroup: 'industry', rlLimit: 150, rlRemaining: 100 }));
    await sb.report(makeReport({ url: INDUSTRY_URL, status: 429, retryAfter: 30, rlGroup: 'industry' }));
    expect(h.store.get('lgi:esi:rl:block:group:industry')?.value).toBe(String(nowSec + 30));
    expect(h.store.has('lgi:esi:rl:block:/industry/systems')).toBe(false);
    expect((await sb.preDispatch(INDUSTRY_URL)).blockedRetryAfter).toBe(30);
    expect((await sb.preDispatch(FACILITIES_URL)).blockedRetryAfter).toBe(30);
    expect((await sb.preDispatch(TEST_URL)).blockedRetryAfter).toBeNull();

    await sb.report(makeReport({ status: 429, retryAfter: 45 }));
    expect(h.store.get(BLOCK_KEY)?.value).toBe(String(nowSec + 45));
    expect((await sb.preDispatch(TEST_URL)).blockedRetryAfter).toBe(45);
  });

  it('counts market-history calls a minute across instances and reports the count before a history dispatch', async () => {
    const sb = redisScoreboard();
    expect((await sb.preDispatch(HISTORY_URL)).historyCalls).toBe(0);
    await sb.report(makeReport({ url: HISTORY_URL, status: 200 }));
    await sb.report(makeReport({ url: HISTORY_URL, status: NO_RESPONSE_STATUS }));
    await sb.report(makeReport({ url: HISTORY_URL, status: 500 }));
    await sb.report(makeReport({ status: 200 }));
    expect(h.store.get(`lgi:esi:history:count:${currentMinute()}`)).toEqual({ value: '3', expiresAt: Date.now() + 120_000 });
    expect((await sb.preDispatch(HISTORY_URL)).historyCalls).toBe(3);
    expect((await sb.preDispatch(TEST_URL)).historyCalls).toBeUndefined();
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

    await sb!.report(makeReport({ status: 420 }));
    const closed = await sb!.preDispatch(TEST_URL);
    expect(closed.effectiveRemaining).toBe(0);

    await sb!.report(makeReport({ status: 429, retryAfter: 30 }));
    const blocked = await sb!.preDispatch(TEST_URL);
    expect(blocked.blockedRetryAfter).toBe(30);

    await sb!.report(makeReport({ status: 200 }));

    expect(resolveScoreboard()).toBe(sb);
    await expect(readEsiBudgetSnapshot()).resolves.toEqual({
      effectiveRemaining: 0,
      selfCount: 2,
      echo: 0,
      source: 'process-local',
    });
    await expect(readEsiAvailabilitySnapshot()).resolves.toEqual({
      calls: 3,
      failures: 2,
      source: 'process-local',
    });
  });

  it('keeps the group echo, the group block and the history count in process as well', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.useFakeTimers();
    const sb = resolveScoreboard()!;

    await sb.report(makeReport({ status: 200, rlGroup: 'market-order', rlLimit: 12000, rlRemaining: 500 }));
    await sb.report(makeReport({ status: 200, rlGroup: 'market-order', rlLimit: 12000, rlRemaining: 900 }));
    expect((await sb.preDispatch(TEST_URL)).groupBudget).toEqual({ group: 'market-order', remaining: 500, limit: 12000 });
    vi.advanceTimersByTime(61_000);
    expect((await sb.preDispatch(TEST_URL)).groupBudget).toBeUndefined();

    await sb.report(makeReport({ url: FACILITIES_URL, status: 200, rlGroup: 'industry', rlLimit: 150, rlRemaining: 100 }));
    await sb.report(makeReport({ url: INDUSTRY_URL, status: 429, retryAfter: 30, rlGroup: 'industry' }));
    expect((await sb.preDispatch(FACILITIES_URL)).blockedRetryAfter).toBe(30);
    expect((await sb.preDispatch(TEST_URL)).blockedRetryAfter).toBeNull();
    await sb.report(makeReport({ status: 429, retryAfter: 45 }));
    expect((await sb.preDispatch(TEST_URL)).blockedRetryAfter).toBe(45);

    expect((await sb.preDispatch(HISTORY_URL)).historyCalls).toBe(0);
    await sb.report(makeReport({ url: HISTORY_URL, status: 200 }));
    await sb.report(makeReport({ url: HISTORY_URL, status: 500 }));
    expect((await sb.preDispatch(HISTORY_URL)).historyCalls).toBe(2);
    expect((await sb.preDispatch(TEST_URL)).historyCalls).toBeUndefined();
    vi.advanceTimersByTime(120_000);
    expect((await sb.preDispatch(HISTORY_URL)).historyCalls).toBe(0);
  });

  it('keeps an hour of in-process call buckets and drops the rest', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:30Z'));
    const sb = resolveScoreboard()!;
    await sb.report(makeReport({ status: 503 }));
    vi.setSystemTime(new Date('2026-10-09T12:59:30Z'));
    await sb.report(makeReport({ status: 200 }));
    await expect(sb.availabilitySnapshot()).resolves.toEqual({
      calls: 2,
      failures: 1,
      source: 'process-local',
    });
    vi.setSystemTime(new Date('2026-10-09T13:00:30Z'));
    await sb.report(makeReport({ status: NO_RESPONSE_STATUS }));
    await expect(sb.availabilitySnapshot()).resolves.toEqual({
      calls: 2,
      failures: 1,
      source: 'process-local',
    });
  });

  it('returns null on hosted Vercel production and logs the misconfiguration once', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(resolveScoreboard()).toBeNull();
    expect(resolveScoreboard()).toBeNull();
    await expect(readEsiBudgetSnapshot()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the in-process scoreboard under production next start when Vercel is not the host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');

    expect(resolveScoreboard()).not.toBeNull();
  });

  it('stays fail-closed on Vercel even when the sidecar driver is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(resolveScoreboard()).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
