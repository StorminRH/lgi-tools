import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const configured = vi.fn<
    () => { url: string; token: string } | null
  >(() => ({
    url: 'https://example.upstash.io',
    token: 'token',
  }));
  const fail = vi.fn(() => false);

  class FakeRedis {
    async eval(_script: string, keys: string[], args: string[]): Promise<number> {
      if (fail()) throw new Error('redis unavailable');
      const key = keys[0];
      const dueAt = Number(args[0]);
      if (key === undefined || !Number.isFinite(dueAt)) {
        throw new Error('invalid eval input');
      }
      const current = Number(store.get(key));
      if (!Number.isFinite(current) || current > dueAt) store.set(key, dueAt);
      return 1;
    }

    async set(key: string, value: unknown): Promise<'OK'> {
      if (fail()) throw new Error('redis unavailable');
      store.set(key, value);
      return 'OK';
    }

    async del(key: string): Promise<number> {
      if (fail()) throw new Error('redis unavailable');
      return store.delete(key) ? 1 : 0;
    }

    async get(key: string): Promise<unknown> {
      if (fail()) throw new Error('redis unavailable');
      return store.get(key) ?? null;
    }
  }

  return { store, configured, fail, FakeRedis };
});

vi.mock('@upstash/redis', () => ({ Redis: mocks.FakeRedis }));
vi.mock('@/lib/upstash', () => ({ resolveUpstashRest: mocks.configured }));

import {
  advancePendingWorkSignal,
  readPendingWorkSignal,
  writeBackPendingWorkSignal,
} from './pending-signal';

const KEY = 'lgi:esi-refresh:next-due';
const NOW = new Date('2026-07-17T12:00:00.000Z');

describe('pending work signal', () => {
  beforeEach(() => {
    mocks.store.clear();
    mocks.configured.mockReturnValue({
      url: 'https://example.upstash.io',
      token: 'token',
    });
    mocks.fail.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('only moves the pending timestamp earlier', async () => {
    await advancePendingWorkSignal(new Date('2026-07-17T13:00:00.000Z'));
    await advancePendingWorkSignal(new Date('2026-07-17T14:00:00.000Z'));
    await advancePendingWorkSignal(new Date('2026-07-17T12:30:00.000Z'));

    expect(mocks.store.get(KEY)).toBe(
      new Date('2026-07-17T12:30:00.000Z').getTime(),
    );
  });

  it('writes back the earliest residual job and clears an empty queue', async () => {
    const earliest = new Date('2026-07-17T15:00:00.000Z');
    await writeBackPendingWorkSignal(earliest);
    expect(mocks.store.get(KEY)).toBe(earliest.getTime());

    await writeBackPendingWorkSignal(null);
    expect(mocks.store.has(KEY)).toBe(false);
  });

  it('distinguishes due work from empty or future work', async () => {
    await expect(readPendingWorkSignal(NOW)).resolves.toBe('idle');

    mocks.store.set(KEY, NOW.getTime() + 1);
    await expect(readPendingWorkSignal(NOW)).resolves.toBe('idle');

    mocks.store.set(KEY, NOW.getTime());
    await expect(readPendingWorkSignal(NOW)).resolves.toBe('due');
  });

  it('returns unknown when Redis is unconfigured, unavailable, or invalid', async () => {
    mocks.configured.mockReturnValueOnce(null);
    await expect(readPendingWorkSignal(NOW)).resolves.toBe('unknown');

    mocks.fail.mockReturnValueOnce(true);
    await expect(readPendingWorkSignal(NOW)).resolves.toBe('unknown');

    mocks.store.set(KEY, 'not-a-timestamp');
    await expect(readPendingWorkSignal(NOW)).resolves.toBe('unknown');
  });

  it('swallows write failures and missing configuration', async () => {
    mocks.fail.mockReturnValueOnce(true);
    await expect(advancePendingWorkSignal(NOW)).resolves.toBeUndefined();

    mocks.configured.mockReturnValueOnce(null);
    await expect(writeBackPendingWorkSignal(NOW)).resolves.toBeUndefined();
  });
});
