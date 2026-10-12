import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryDailyRow } from './types';

const fetchHistoryFromSourceMock = vi.fn();
const storedExpiriesMock = vi.fn();
const commitMock = vi.fn();
const getStoredHistoryMock = vi.fn();
const persistHistoryMock = vi.fn();
const afterMock = vi.fn();

vi.mock('./source', () => ({
  fetchHistoryFromSource: (...args: unknown[]) => fetchHistoryFromSourceMock(...args),
}));
vi.mock('./queries', () => ({
  getStoredHistory: (...args: unknown[]) => getStoredHistoryMock(...args),
}));
vi.mock('./ingest', () => ({
  persistHistory: (...args: unknown[]) => persistHistoryMock(...args),
}));
vi.mock('@/data/esi-store', async () => ({
  ...(await vi.importActual<typeof import('@/data/esi-store/expiry')>('@/data/esi-store/expiry')),
  storedExpiries: (...args: unknown[]) => storedExpiriesMock(...args),
  commit: (...args: unknown[]) => commitMock(...args),
}));
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));
vi.mock('@/db', () => ({ db: {} }));

import { historyKey } from './keys';
import { getLiveHistory } from './refresh-on-view';

const EXPIRES = Date.parse('2026-06-15T11:05:00Z');

function meta(typeId: number, expiresAt: number | null = EXPIRES) {
  return { key: historyKey(typeId), expiresAt, etags: ['"h"'], lastModified: null, checkedAt: EXPIRES - 86_400_000 };
}

/** The store's expiry per type: a number, or null when it has no row. */
function expiries(byId: Record<number, number | null>) {
  storedExpiriesMock.mockImplementation((keys: { params: { type_id: number } }[]) =>
    Promise.resolve(keys.map((key) => byId[key.params.type_id] ?? null)),
  );
}

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
  commitMock.mockResolvedValue(undefined);
  expiries({});
});

describe('getLiveHistory — stale gate', () => {
  it('serves a warm type from stored rows and makes NO source call', async () => {
    expiries({ 34: Date.now() + 60 * 60 * 1000 });
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-13', 30)]]));

    const { inputs, degraded, metrics } = await getLiveHistory([34]);

    expect(fetchHistoryFromSourceMock).not.toHaveBeenCalled();
    expect(degraded.fetched).toBe(0);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    expect(afterMock).not.toHaveBeenCalled();
    expect(metrics).toEqual({ requested: 1, freshEsi: 0, warmStored: 1, staleStored: 0, missing: 0 });
  });

  it('fetches a stale type, returns the fresh series, and persists write-behind', async () => {
    expiries({ 34: Date.now() - 60 * 60 * 1000 });
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-10', 5)]]));
    const fresh = series('2026-06-13', 30);
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [{ typeId: 34, rows: fresh, meta: meta(34), source: 'esi' }],
      budgetExhausted: false,
    });

    const observer = vi.fn();
    const { inputs, degraded, metrics } = await getLiveHistory([34], observer);

    expect(fetchHistoryFromSourceMock).toHaveBeenCalledWith([34]);
    expect(degraded.fetched).toBe(1);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    expect(afterMock).toHaveBeenCalledOnce();
    await afterMock.mock.calls[0]![0]();
    expect(persistHistoryMock).toHaveBeenCalledWith({}, 34, fresh, new Date(EXPIRES), 'esi');
    expect(commitMock).toHaveBeenCalledWith([meta(34)], { tag: 'eve:market_history' });
    expect(metrics).toEqual({ requested: 1, freshEsi: 1, warmStored: 0, staleStored: 0, missing: 0 });
    expect(observer).toHaveBeenCalledWith({
      outcome: 'succeeded',
      attempted: 1,
      written: 0,
      durationMs: expect.any(Number),
    });
  });

  it('fetches a missing type (no stored answer) and, with no Expires, stamps it due at once', async () => {
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [{ typeId: 34, rows: series('2026-06-13', 3), meta: meta(34, null), source: 'esi' }],
      budgetExhausted: false,
    });

    const { inputs } = await getLiveHistory([34]);
    expect(storedExpiriesMock).toHaveBeenCalledWith([historyKey(34)]);
    expect(fetchHistoryFromSourceMock).toHaveBeenCalledWith([34]);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    await afterMock.mock.calls[0]![0]();
    expect(persistHistoryMock.mock.calls[0]![3]).toEqual(new Date(meta(34).checkedAt));
  });

  it('commits only the types whose rows were written', async () => {
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [
        { typeId: 34, rows: series('2026-06-13', 3), meta: meta(34), source: 'esi' },
        { typeId: 35, rows: series('2026-06-13', 3), meta: meta(35), source: 'esi' },
      ],
      budgetExhausted: false,
    });
    persistHistoryMock.mockRejectedValueOnce(new Error('neon: connection terminated'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const observer = vi.fn();

    await getLiveHistory([34, 35], observer);
    await afterMock.mock.calls[0]![0]();

    expect(commitMock).toHaveBeenCalledWith([meta(35)], { tag: 'eve:market_history' });
    expect(observer).toHaveBeenCalledWith({ outcome: 'partial', attempted: 2, written: 0, durationMs: expect.any(Number) });
    errorSpy.mockRestore();
  });

  it('does not let a write-behind observer failure escape', async () => {
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [
        { typeId: 34, rows: series('2026-06-13', 3), meta: meta(34), source: 'esi' },
      ],
      budgetExhausted: false,
    });
    const observer = vi.fn(() => {
      throw new Error('observer failed');
    });

    await getLiveHistory([34], observer);
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(observer).toHaveBeenCalledTimes(1);
    expect(persistHistoryMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the stored series when a stale type fails to fetch', async () => {
    expiries({ 34: Date.now() - 1000 });
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-10', 5)]]));
    fetchHistoryFromSourceMock.mockResolvedValue({ results: [], budgetExhausted: true });

    const { inputs, degraded, metrics } = await getLiveHistory([34]);
    expect(degraded.budgetExhausted).toBe(true);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-10');
    expect(metrics.staleStored).toBe(1);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('classifies a type with no fresh or stored series as missing', async () => {
    getStoredHistoryMock.mockResolvedValue(new Map());
    fetchHistoryFromSourceMock.mockResolvedValue({ results: [], budgetExhausted: false });

    const { metrics } = await getLiveHistory([34]);

    expect(metrics).toEqual({ requested: 1, freshEsi: 0, warmStored: 0, staleStored: 0, missing: 1 });
  });
});
