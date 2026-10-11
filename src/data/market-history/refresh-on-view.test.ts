import { beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import type { HistoryDailyRow } from './types';

const fetchHistoryFromSourceMock = vi.fn();
const getHistoryMetaMock = vi.fn();
const getStoredHistoryMock = vi.fn();
const persistHistoryMock = vi.fn();
const afterMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock('./source', () => ({
  fetchHistoryFromSource: (...args: unknown[]) => fetchHistoryFromSourceMock(...args),
}));
vi.mock('./queries', () => ({
  getHistoryMeta: (...args: unknown[]) => getHistoryMetaMock(...args),
  getStoredHistory: (...args: unknown[]) => getStoredHistoryMock(...args),
}));
vi.mock('./ingest', () => ({
  persistHistory: (...args: unknown[]) => persistHistoryMock(...args),
}));
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));
vi.mock('@/db', () => ({ db: {} }));

import { getLiveHistory } from './refresh-on-view';

function series(end: string, n: number, volume = 100): HistoryDailyRow[] {
  const endDay = Math.floor(Date.parse(`${end}T00:00:00Z`) / 86_400_000);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date((endDay - (n - 1 - i)) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, average: 10, highest: 11, lowest: 9, volume: BigInt(volume), orderCount: 1 };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  persistHistoryMock.mockResolvedValue({ written: 0 });
});

describe('getLiveHistory — stale gate', () => {
  it('serves a warm type from stored rows and makes NO source call', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    getHistoryMetaMock.mockResolvedValue(new Map([[34, { staleAfter: future }]]));
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-13', 30)]]));

    const { inputs, degraded, metrics } = await getLiveHistory([34]);

    expect(fetchHistoryFromSourceMock).not.toHaveBeenCalled();
    expect(degraded.fetched).toBe(0);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    expect(afterMock).not.toHaveBeenCalled();
    expect(metrics).toEqual({ requested: 1, freshEsi: 0, warmStored: 1, staleStored: 0, missing: 0 });
  });

  it('fetches a stale type, returns the fresh series, and persists write-behind', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    getHistoryMetaMock.mockResolvedValue(new Map([[34, { staleAfter: past }]]));
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-10', 5)]]));
    const fresh = series('2026-06-13', 30);
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [{ typeId: 34, rows: fresh, staleAfter: new Date(), source: 'esi' }],
      budgetExhausted: false,
    });

    const observer = vi.fn();
    const { inputs, degraded, metrics } = await getLiveHistory([34], observer);

    expect(fetchHistoryFromSourceMock).toHaveBeenCalledWith([34]);
    expect(degraded.fetched).toBe(1);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    expect(afterMock).toHaveBeenCalledOnce();
    await afterMock.mock.calls[0]![0]();
    expect(persistHistoryMock).toHaveBeenCalledOnce();
    expect(revalidateTagMock).toHaveBeenCalledWith('market-history-34', 'max');
    expect(metrics).toEqual({ requested: 1, freshEsi: 1, warmStored: 0, staleStored: 0, missing: 0 });
    expect(observer).toHaveBeenCalledWith({
      outcome: 'succeeded',
      attempted: 1,
      written: 0,
      durationMs: expect.any(Number),
    });
  });

  it('reads the stored series beside the meta and falls back to it when a stale type fails to fetch', async () => {
    const meta = Promise.withResolvers<Map<number, { staleAfter: Date }>>();
    getHistoryMetaMock.mockReturnValue(meta.promise);
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-10', 5)], [35, series('2026-06-12', 5)]]));
    fetchHistoryFromSourceMock.mockResolvedValue({ results: [], budgetExhausted: true });

    const pending = getLiveHistory([34, 35]);

    // The stored read starts before the meta read settles and the source fetch begins.
    expect(getStoredHistoryMock).toHaveBeenCalledWith([34, 35]);
    expect(fetchHistoryFromSourceMock).not.toHaveBeenCalled();
    meta.resolve(new Map([[35, { staleAfter: new Date(Date.now() + 60 * 60 * 1000) }]]));

    const { inputs, degraded, metrics } = await pending;
    expect(fetchHistoryFromSourceMock).toHaveBeenCalledWith([34]);
    expect(getStoredHistoryMock).toHaveBeenCalledOnce();
    expect(degraded.budgetExhausted).toBe(true);
    expect(afterMock).not.toHaveBeenCalled();
    expect(inputs.get(34)?.latestDate).toBe('2026-06-10');
    expect(inputs.get(35)?.latestDate).toBe('2026-06-12');
    expect(metrics).toEqual({ requested: 2, freshEsi: 0, warmStored: 1, staleStored: 1, missing: 0 });
  });

  it('fetches a missing type (no meta row)', async () => {
    getHistoryMetaMock.mockResolvedValue(new Map());
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [{ typeId: 34, rows: series('2026-06-13', 3), staleAfter: new Date(), source: 'esi' }],
      budgetExhausted: false,
    });

    const { inputs } = await getLiveHistory([34]);
    expect(fetchHistoryFromSourceMock).toHaveBeenCalledWith([34]);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
  });

  it('does not let a write-behind observer failure escape', async () => {
    getHistoryMetaMock.mockResolvedValue(new Map());
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [
        { typeId: 34, rows: series('2026-06-13', 3), staleAfter: new Date(), source: 'esi' },
      ],
      budgetExhausted: false,
    });
    const failure = new Error('observer failed');
    const observer = vi.fn(() => {
      throw failure;
    });
    const errors = silenceConsolePrefixes('error', ['[market-history/refresh-on-view] ']);

    await getLiveHistory([34], observer);
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(observer).toHaveBeenCalledTimes(1);
    expect(persistHistoryMock).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls).toEqual([
      ['[market-history/refresh-on-view] write-behind observer failed', failure],
    ]);
    errors.mockRestore();
  });

  it('classifies a type with no fresh or stored series as missing', async () => {
    getHistoryMetaMock.mockResolvedValue(new Map());
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({ results: [], budgetExhausted: false });

    const { metrics } = await getLiveHistory([34]);

    expect(metrics).toEqual({ requested: 1, freshEsi: 0, warmStored: 0, staleStored: 0, missing: 1 });
  });
});
