import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawMarketPrice } from './types';

const fetchPricesFromSourceMock = vi.fn();
const recordMetasMock = vi.fn();

vi.mock('./source', () => ({
  fetchPricesFromSource: (...args: unknown[]) => fetchPricesFromSourceMock(...args),
}));
vi.mock('@/data/esi-store', () => ({ recordMetas: (...args: unknown[]) => recordMetasMock(...args) }));

import { priceKey } from './keys';
import { persistPrices, refreshPrices } from './ingest';

const EXPIRES = Date.parse('2026-10-12T12:05:00Z');
const META = { key: priceKey(1), expiresAt: EXPIRES, etags: ['"e"'], lastModified: null, checkedAt: EXPIRES - 300_000 };

function row(typeId: number, source: RawMarketPrice['source']): RawMarketPrice {
  return {
    typeId,
    bestBuy: 1,
    bestSell: 2,
    pct5Buy: 1,
    pct5Sell: 2,
    buyVolume: BigInt(1),
    sellVolume: BigInt(1),
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
    source,
  };
}

function fakeDb() {
  const values = vi.fn((rows: RawMarketPrice[]) => ({
    onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn().mockResolvedValue(rows) })),
  }));
  const insert = vi.fn(() => ({ values }));
  return { insert };
}

describe('refreshPrices — source mix (3.0.10 O-1)', () => {
  beforeEach(() => {
    fetchPricesFromSourceMock.mockReset();
    recordMetasMock.mockReset().mockResolvedValue(undefined);
  });

  it('counts esi vs fuzzwork-fallback rows, carries budgetExhausted and records the ESI metas after the write', async () => {
    fetchPricesFromSourceMock.mockResolvedValue({
      prices: [row(1, 'esi'), row(2, 'esi'), row(3, 'fuzzwork-fallback')],
      budgetExhausted: true,
      metaByType: new Map([[1, META], [2, { ...META, key: priceKey(2) }]]),
    });
    const db = fakeDb();
    const summary = await refreshPrices(db as never, [1, 2, 3]);
    expect(summary.fetched).toBe(3);
    expect(summary.written).toBe(3);
    expect(summary.esiCount).toBe(2);
    expect(summary.fuzzworkFallbackCount).toBe(1);
    expect(summary.budgetExhausted).toBe(true);
    const [rows] = db.insert.mock.results[0]!.value.values.mock.calls[0]!;
    expect(rows.map((r: { typeId: number; staleAfter: Date; updatedAt: Date }) => [r.typeId, r.staleAfter.getTime() === EXPIRES || r.staleAfter === r.updatedAt])).toEqual([[1, true], [2, true], [3, true]]);
    expect(recordMetasMock).toHaveBeenCalledWith([META, { ...META, key: priceKey(2) }]);
  });

  it('zeroes the mix on empty input without calling the source', async () => {
    const summary = await refreshPrices(fakeDb() as never, []);
    expect(summary).toMatchObject({
      fetched: 0,
      written: 0,
      esiCount: 0,
      fuzzworkFallbackCount: 0,
      budgetExhausted: false,
    });
    expect(fetchPricesFromSourceMock).not.toHaveBeenCalled();
  });
});

describe('persistPrices — upsert already-fetched rows (3.2.4a write-behind)', () => {
  it('writes null for a raw missing regionalDiscount — a pre-3.7.26.1 cached payload', async () => {
    const stale = row(1, 'esi') as unknown as Record<string, unknown>;
    delete stale.regionalDiscount;
    const db = fakeDb();
    await persistPrices(db as never, [stale as never]);
    const values = db.insert.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    const [rows] = values.mock.calls[0]!;
    expect(rows[0].regionalDiscount).toBeNull();
  });

  it('upserts the rows and summarizes the source mix from the given meta', async () => {
    const db = fakeDb();
    const summary = await persistPrices(
      db as never,
      [row(1, 'esi'), row(2, 'fuzzwork-fallback')],
      { requested: 3, budgetExhausted: true },
    );
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      requested: 3,
      fetched: 2,
      written: 2,
      esiCount: 1,
      fuzzworkFallbackCount: 1,
      budgetExhausted: true,
    });
  });

  it('defaults requested to the row count and skips the write on empty input', async () => {
    const db = fakeDb();
    const summary = await persistPrices(db as never, []);
    expect(db.insert).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ requested: 0, fetched: 0, written: 0, budgetExhausted: false });
  });

  it('preserves the source fetch time and CCP\'s expiry when a fetched row is written later', async () => {
    const db = fakeDb();
    const fetchedAt = new Date(Date.now() - 60_000);
    await persistPrices(db as never, [row(34, 'esi'), row(35, 'fuzzwork-fallback')], {
      fetchedAtByType: new Map([[34, fetchedAt], [35, fetchedAt]]),
      staleAfterByType: new Map([[34, new Date(EXPIRES)]]),
    });
    const [saved, fallback] = db.insert.mock.results[0]!.value.values.mock.calls[0]![0];
    expect(saved.updatedAt).toEqual(fetchedAt);
    expect(saved.staleAfter.getTime()).toBe(EXPIRES);
    expect(fallback.staleAfter).toEqual(fetchedAt);
  });

  it('chunks a large batch into ≤1,000-row inserts', async () => {
    const db = fakeDb();
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1, 'esi'));
    const summary = await persistPrices(db as never, rows);
    expect(db.insert).toHaveBeenCalledTimes(3);
    expect(summary.written).toBe(2500);
  });

  it('writes a ≤1,000-row batch in a single insert', async () => {
    const db = fakeDb();
    const summary = await persistPrices(
      db as never,
      Array.from({ length: 1000 }, (_, i) => row(i + 1, 'esi')),
    );
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(summary.written).toBe(1000);
  });
});
