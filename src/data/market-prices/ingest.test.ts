import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawMarketPrice } from './types';

const fetchPricesFromSourceMock = vi.fn();

vi.mock('./source', () => ({
  fetchPricesFromSource: (...args: unknown[]) => fetchPricesFromSourceMock(...args),
}));

import { refreshPrices } from './ingest';

function row(typeId: number, source: RawMarketPrice['source']): RawMarketPrice {
  return {
    typeId,
    bestBuy: 1,
    bestSell: 2,
    pct5Buy: 1,
    pct5Sell: 2,
    buyVolume: BigInt(1),
    sellVolume: BigInt(1),
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
