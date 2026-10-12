import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchStoredMock = vi.fn();
const batchInits: { concurrency: number }[] = [];

/** The batched read as one call per key, a thrown call kept to its key the way the store keeps it. */
vi.mock('@/data/esi-store', () => ({
  fetchStoredMany: (keys: unknown[], init: { concurrency: number }) => {
    batchInits.push(init);
    return Promise.all(keys.map((key) => Promise.resolve(fetchStoredMock(key)).catch((error: unknown) => ({ kind: 'failed', error }))));
  },
}));

import { EsiBudgetExhaustedError } from '@/platform/esi';
import { HISTORY_FETCH_CONCURRENCY } from './constants';
import { historyKey } from './keys';
import { fetchHistoryFromSource, parseEsiHistory } from './source';

const EXPIRES = Date.parse('2026-06-15T11:05:00Z');

function meta(typeId: number) {
  return { key: historyKey(typeId), expiresAt: EXPIRES, etags: ['"h"'], lastModified: null, checkedAt: EXPIRES - 86_400_000 };
}

function typeIdOf(key: { params?: { type_id?: unknown } }): number {
  return Number(key.params?.type_id);
}

const sampleItem = {
  average: 4.06,
  date: '2025-05-01',
  highest: 4.1,
  lowest: 4.04,
  order_count: 1471,
  volume: 6498537635,
};

function fresh(typeId: number, items: unknown[]) {
  return { kind: 'fresh', res: new Response(JSON.stringify(items), { status: 200 }), meta: meta(typeId) };
}

beforeEach(() => {
  fetchStoredMock.mockReset();
  batchInits.length = 0;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('parseEsiHistory', () => {
  it('maps the verified daily shape and carries volume as bigint', () => {
    const rows = parseEsiHistory([sampleItem]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      date: '2025-05-01',
      average: 4.06,
      highest: 4.1,
      lowest: 4.04,
      volume: BigInt(6498537635),
      orderCount: 1471,
    });
  });

  it('ignores unknown keys (upstream additions cannot break parsing)', () => {
    const rows = parseEsiHistory([{ ...sampleItem, donations: 7 }]);
    expect(rows[0]!.volume).toBe(BigInt(6498537635));
  });

  it('throws EsiContractError on a non-array or a missing consumed field', () => {
    expect(() => parseEsiHistory({ not: 'an array' })).toThrow();
    const { volume: _omitted, ...withoutVolume } = sampleItem;
    expect(() => parseEsiHistory([withoutVolume])).toThrow();
  });
});

describe('fetchHistoryFromSource', () => {
  it('reads one key per type through one batched store read at HISTORY_FETCH_CONCURRENCY and carries each answer\'s meta', async () => {
    fetchStoredMock.mockImplementation((key) => Promise.resolve(fresh(typeIdOf(key), [{ ...sampleItem, average: typeIdOf(key) }])));

    const { results, budgetExhausted } = await fetchHistoryFromSource([34, 35, 34]);
    expect(budgetExhausted).toBe(false);
    expect(results).toHaveLength(2);
    expect(fetchStoredMock.mock.calls.map(([key]) => key)).toEqual([historyKey(34), historyKey(35)]);
    expect(batchInits).toEqual([{ concurrency: HISTORY_FETCH_CONCURRENCY }]);
    expect(HISTORY_FETCH_CONCURRENCY).toBe(20);
    const r34 = results.find((r) => r.typeId === 34)!;
    expect(r34.source).toBe('esi');
    expect(r34.rows[0]!.average).toBe(34);
    expect(r34.meta).toEqual(meta(34));
  });

  it('skips a type on an error status, an unchanged answer or a malformed body, keeping its stored series', async () => {
    fetchStoredMock.mockImplementation((key) => {
      const id = typeIdOf(key);
      if (id === 99) return Promise.resolve({ kind: 'error', status: 404 });
      if (id === 98) return Promise.resolve({ kind: 'unchanged', expiresAt: EXPIRES });
      if (id === 97) return Promise.resolve(fresh(97, [{ nope: true }]));
      return Promise.resolve(fresh(id, [sampleItem]));
    });

    const { results } = await fetchHistoryFromSource([34, 99, 98, 97]);
    expect(results.map((r) => r.typeId)).toEqual([34]);
  });

  it('flags budget exhaustion and keeps the other answers of the batch', async () => {
    fetchStoredMock.mockImplementation((key) =>
      typeIdOf(key) === 2 ? Promise.reject(new EsiBudgetExhaustedError(0)) : Promise.resolve(fresh(typeIdOf(key), [sampleItem])),
    );
    const { results, budgetExhausted } = await fetchHistoryFromSource([1, 2, 3]);
    expect(results.map((r) => r.typeId)).toEqual([1, 3]);
    expect(budgetExhausted).toBe(true);
  });
});
