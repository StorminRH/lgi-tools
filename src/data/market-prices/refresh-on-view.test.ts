import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_AFTER_TTL_MS } from './constants';
import type { MarketPrice, RawMarketPrice } from './types';

const fetchPricesFromSourceMock = vi.fn();
const getPricesMock = vi.fn();
const persistPricesMock = vi.fn();
const afterMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock('./source', () => ({
  fetchPricesFromSource: (...args: unknown[]) => fetchPricesFromSourceMock(...args),
}));
vi.mock('./queries', () => ({
  getPrices: (...args: unknown[]) => getPricesMock(...args),
}));
vi.mock('./ingest', () => ({
  persistPrices: (...args: unknown[]) => persistPricesMock(...args),
}));
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));
vi.mock('@/db', () => ({ db: {} }));

import { getLivePrices, priceTag, refreshPricesOnDemand } from './refresh-on-view';

function raw(typeId: number, source: RawMarketPrice['source']): RawMarketPrice {
  return {
    typeId,
    bestBuy: 10,
    bestSell: 12,
    pct5Buy: 9,
    pct5Sell: 13,
    buyVolume: BigInt(100),
    sellVolume: BigInt(200),
    source,
  };
}

function seed(typeId: number): MarketPrice {
  return {
    typeId,
    bestBuy: 1,
    bestSell: 2,
    pct5Buy: 1,
    pct5Sell: 2,
    buyVolume: BigInt(1),
    sellVolume: BigInt(1),
    source: 'fuzzwork',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    staleAfter: new Date('2026-01-01T01:00:00Z'),
  };
}

// fetchPricesFromSource is called once per type with a length-1 array. Route
// each call to the per-id response configured for the test.
function sourceByTypeId(
  byId: Record<number, { prices: RawMarketPrice[]; budgetExhausted?: boolean }>,
  opts?: { throwFor?: number[] },
) {
  fetchPricesFromSourceMock.mockImplementation((ids: number[]) => {
    const id = ids[0];
    if (opts?.throwFor?.includes(id)) return Promise.reject(new Error('source down'));
    const r = byId[id] ?? { prices: [] };
    return Promise.resolve({ prices: r.prices, budgetExhausted: r.budgetExhausted ?? false });
  });
}

beforeEach(() => {
  fetchPricesFromSourceMock.mockReset();
  getPricesMock.mockReset();
  persistPricesMock.mockReset();
  afterMock.mockReset();
  revalidateTagMock.mockReset();
  persistPricesMock.mockResolvedValue(undefined);
  getPricesMock.mockResolvedValue(new Map());
});

describe('getLivePrices', () => {
  it('returns the live value over the seed and stamps a fresh expiry', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });

    const { prices, degraded } = await getLivePrices([34]);

    const row = prices.get(34)!;
    expect(row.source).toBe('esi');
    expect(row.bestBuy).toBe(10); // live, not the seed's 1
    expect(row.staleAfter.getTime() - row.updatedAt.getTime()).toBe(STALE_AFTER_TTL_MS);
    expect(degraded).toMatchObject({ fetched: 1, esiCount: 1, fuzzworkFallbackCount: 0 });
  });

  it('falls back to the seed when a live fetch throws', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    sourceByTypeId({}, { throwFor: [34] });

    const { prices, degraded } = await getLivePrices([34]);

    expect(prices.get(34)).toEqual(seed(34));
    expect(degraded.fetched).toBe(0);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('falls back to the seed when the source returns no row', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    sourceByTypeId({ 34: { prices: [] } });

    const { prices } = await getLivePrices([34]);

    expect(prices.get(34)).toEqual(seed(34));
  });

  it('omits a type with neither a live nor a seed price', async () => {
    sourceByTypeId({ 99: { prices: [] } });
    const { prices } = await getLivePrices([99]);
    expect(prices.has(99)).toBe(false);
  });

  it('schedules write-behind with only the freshly fetched rows', async () => {
    getPricesMock.mockResolvedValue(new Map([[35, seed(35)]]));
    sourceByTypeId({
      34: { prices: [raw(34, 'esi')] },
      35: { prices: [] }, // seed-only — not persisted
    });

    await getLivePrices([34, 35]);

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0][0](); // run the scheduled callback
    expect(persistPricesMock).toHaveBeenCalledTimes(1);
    const persisted = persistPricesMock.mock.calls[0][1] as RawMarketPrice[];
    expect(persisted.map((r) => r.typeId)).toEqual([34]);
  });

  it('tallies esi vs fuzzwork-fallback and budget exhaustion across items', async () => {
    sourceByTypeId({
      34: { prices: [raw(34, 'esi')] },
      35: { prices: [raw(35, 'fuzzwork-fallback')], budgetExhausted: true },
    });

    const { degraded } = await getLivePrices([34, 35]);

    expect(degraded).toEqual({
      fetched: 2,
      esiCount: 1,
      fuzzworkFallbackCount: 1,
      budgetExhausted: true,
    });
  });

  it('dedupes type ids before reading seed and source', async () => {
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    await getLivePrices([34, 34]);
    expect(getPricesMock).toHaveBeenCalledWith([34]);
    expect(fetchPricesFromSourceMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty without touching seed, source, or write-behind on empty input', async () => {
    const { prices, degraded } = await getLivePrices([]);
    expect(prices.size).toBe(0);
    expect(degraded).toEqual({
      fetched: 0,
      esiCount: 0,
      fuzzworkFallbackCount: 0,
      budgetExhausted: false,
    });
    expect(getPricesMock).not.toHaveBeenCalled();
    expect(fetchPricesFromSourceMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});

describe('refreshPricesOnDemand', () => {
  it('busts each unique item tag with the max profile', async () => {
    await refreshPricesOnDemand([34, 35, 34]);
    expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    expect(revalidateTagMock).toHaveBeenCalledWith(priceTag(34), 'max');
    expect(revalidateTagMock).toHaveBeenCalledWith(priceTag(35), 'max');
  });
});
