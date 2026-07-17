import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const configured = vi.fn<
    () => { url: string; token: string } | null
  >(() => ({
    url: 'https://example.upstash.io',
    token: 'token',
  }));
  const fail = vi.fn(() => false);
  const set = vi.fn(
    async (key: string, value: unknown, options?: { ex?: number }) => {
      if (fail()) throw new Error('redis unavailable');
      store.set(key, value);
      return options;
    },
  );

  class FakeRedis {
    set = set;

    async get(key: string): Promise<unknown> {
      if (fail()) throw new Error('redis unavailable');
      return store.get(key) ?? null;
    }
  }

  return { store, configured, fail, set, FakeRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: mocks.FakeRedis }));
vi.mock('@/lib/upstash', () => ({ resolveUpstashRest: mocks.configured }));

import {
  hasRecentBudgetExhaustion,
  markRecentBudgetExhaustion,
} from './exhaustion-marker';

const KEY = 'lgi:esi:recent-exhaustion';

describe('recent ESI budget exhaustion marker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.clear();
    mocks.configured.mockReturnValue({
      url: 'https://example.upstash.io',
      token: 'token',
    });
    mocks.fail.mockReturnValue(false);
  });

  it('sets a 35-minute marker without awaiting it', () => {
    markRecentBudgetExhaustion();

    expect(mocks.set).toHaveBeenCalledWith(KEY, 1, { ex: 35 * 60 });
  });

  it('distinguishes marker absence from a recent refusal', async () => {
    await expect(hasRecentBudgetExhaustion()).resolves.toBe(false);

    mocks.store.set(KEY, 1);
    await expect(hasRecentBudgetExhaustion()).resolves.toBe(true);
  });

  it('returns unknown when Redis is unconfigured or unreachable', async () => {
    mocks.configured.mockReturnValueOnce(null);
    await expect(hasRecentBudgetExhaustion()).resolves.toBe('unknown');

    mocks.fail.mockReturnValueOnce(true);
    await expect(hasRecentBudgetExhaustion()).resolves.toBe('unknown');
  });

  it('swallows marker write failures', async () => {
    mocks.fail.mockReturnValueOnce(true);
    expect(markRecentBudgetExhaustion()).toBeUndefined();
    await Promise.resolve();
  });
});
