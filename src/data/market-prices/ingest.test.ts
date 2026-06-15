import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawMarketPrice } from './types';

const fetchPricesFromSourceMock = vi.fn();

vi.mock('./source', () => ({
  fetchPricesFromSource: (...args: unknown[]) => fetchPricesFromSourceMock(...args),
}));

import { persistPrices, refreshPrices } from './ingest';

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
    source,
  };
}

// Minimal insert chain: insert().values().onConflictDoUpdate() → resolved.
function fakeDb() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { insert };
}

describe('refreshPrices — source mix (3.0.10 O-1)', () => {
  beforeEach(() => {
    fetchPricesFromSourceMock.mockReset();
  });

  it('counts esi vs fuzzwork-fallback rows and carries budgetExhausted', async () => {
    fetchPricesFromSourceMock.mockResolvedValue({
      prices: [row(1, 'esi'), row(2, 'esi'), row(3, 'fuzzwork-fallback')],
      budgetExhausted: true,
    });
    const summary = await refreshPrices(fakeDb() as never, [1, 2, 3]);
    expect(summary.fetched).toBe(3);
    expect(summary.written).toBe(3);
    expect(summary.esiCount).toBe(2);
    expect(summary.fuzzworkFallbackCount).toBe(1);
    expect(summary.budgetExhausted).toBe(true);
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

  // Regression guard: a full-set refresh (~6k types × 12 cols) once sent a
  // single insert over Postgres's 65,535 bind-parameter limit. persistPrices
  // now chunks at 1,000 rows; verify a large batch splits into ≤1,000-row
  // inserts and still reports every row written.
  it('chunks a large batch into ≤1,000-row inserts', async () => {
    const db = fakeDb();
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1, 'esi'));
    const summary = await persistPrices(db as never, rows);
    expect(db.insert).toHaveBeenCalledTimes(3); // 1000 + 1000 + 500
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
