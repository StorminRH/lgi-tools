import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    const future = new Date(Date.now() + 60 * 60 * 1000); // stale_after in the future
    getHistoryMetaMock.mockResolvedValue(new Map([[34, { staleAfter: future }]]));
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-13', 30)]]));

    const { inputs, degraded } = await getLiveHistory([34]);

    expect(fetchHistoryFromSourceMock).not.toHaveBeenCalled();
    expect(degraded.fetched).toBe(0);
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('fetches a stale type, returns the fresh series, and persists write-behind', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000); // stale_after in the past
    getHistoryMetaMock.mockResolvedValue(new Map([[34, { staleAfter: past }]]));
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-10', 5)]])); // old seed
    const fresh = series('2026-06-13', 30);
    fetchHistoryFromSourceMock.mockResolvedValue({
      results: [{ typeId: 34, rows: fresh, staleAfter: new Date(), source: 'esi' }],
      budgetExhausted: false,
    });

    const { inputs, degraded } = await getLiveHistory([34]);

    expect(fetchHistoryFromSourceMock).toHaveBeenCalledWith([34]);
    expect(degraded.fetched).toBe(1);
    // Fresh series wins over the stored seed.
    expect(inputs.get(34)?.latestDate).toBe('2026-06-13');
    // Write-behind scheduled; running it persists + busts the cache tag.
    expect(afterMock).toHaveBeenCalledOnce();
    await afterMock.mock.calls[0]![0]();
    expect(persistHistoryMock).toHaveBeenCalledOnce();
    expect(revalidateTagMock).toHaveBeenCalledWith('market-history-34', 'max');
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

  it('falls back to the stored series when a stale type fails to fetch', async () => {
    const past = new Date(Date.now() - 1000);
    getHistoryMetaMock.mockResolvedValue(new Map([[34, { staleAfter: past }]]));
    getStoredHistoryMock.mockResolvedValue(new Map([[34, series('2026-06-10', 5)]]));
    fetchHistoryFromSourceMock.mockResolvedValue({ results: [], budgetExhausted: true });

    const { inputs, degraded } = await getLiveHistory([34]);
    expect(degraded.budgetExhausted).toBe(true);
    // No fresh result → serve the stored seed rather than dropping the type.
    expect(inputs.get(34)?.latestDate).toBe('2026-06-10');
    expect(afterMock).not.toHaveBeenCalled();
  });
});
