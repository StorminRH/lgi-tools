import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { MarketPrice, RawMarketPrice } from './types';

const MARKET_PRICE_WINDOW_MS = freshnessGate('market_prices').ttlMs;

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
    buyDepth: [{ pct: 0.5, cumVolume: 100 }],
    sellDepth: [{ pct: 0.5, cumVolume: 200 }],
    regionalDiscount: null,
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
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
    source: 'fuzzwork',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    staleAfter: new Date('2026-01-01T00:05:00Z'),
  };
}

function sourceByTypeId(
  byId: Record<number, { prices: RawMarketPrice[]; budgetExhausted?: boolean }>,
  opts?: { throwFor?: number[] },
) {
  fetchPricesFromSourceMock.mockImplementation((ids: number[]) => {
    const id = ids[0]!;
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
  persistPricesMock.mockResolvedValue({ written: 1 });
  getPricesMock.mockResolvedValue(new Map());
});

describe('getLivePrices', () => {
  it('returns the live value over the seed and stamps a fresh expiry', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });

    const { prices, degraded, metrics } = await getLivePrices([34]);

    const row = prices.get(34)!;
    expect(row.source).toBe('esi');
    expect(row.bestBuy).toBe(10);
    expect(row.staleAfter.getTime() - row.updatedAt.getTime()).toBe(
      MARKET_PRICE_WINDOW_MS,
    );
    expect(degraded).toMatchObject({ fetched: 1, esiCount: 1, fuzzworkFallbackCount: 0 });
    expect(metrics).toMatchObject({ requested: 1, returned: 1, esiCount: 1 });
  });

  it('reuses a Neon row under five minutes old without requesting ESI or rewriting it', async () => {
    const row = { ...seed(34), updatedAt: new Date(Date.now() - 60_000), staleAfter: new Date(Date.now() + 240_000) };
    getPricesMock.mockResolvedValue(new Map([[34, row]]));
    const { prices, metrics } = await getLivePrices([34]);
    expect(prices.get(34)).toEqual(row);
    expect(metrics).toMatchObject({ requested: 1, returned: 1, esiCount: 0 });
    expect(fetchPricesFromSourceMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('refreshes only stale or missing rows and ignores legacy 24-hour expiry', async () => {
    const now = Date.now();
    const fresh = { ...seed(34), updatedAt: new Date(now - 60_000), staleAfter: new Date(now + 86_400_000) };
    const stale = { ...seed(35), updatedAt: new Date(now - 300_000), staleAfter: new Date(now + 86_400_000) };
    getPricesMock.mockResolvedValue(new Map([[34, fresh], [35, stale]]));
    sourceByTypeId({ 35: { prices: [raw(35, 'esi')] }, 36: { prices: [raw(36, 'esi')] } });
    const { prices } = await getLivePrices([34, 35, 36]);
    expect(fetchPricesFromSourceMock.mock.calls.map(([ids]) => ids)).toEqual([[35], [36]]);
    expect(prices.get(34)?.staleAfter.getTime()).toBe(fresh.updatedAt.getTime() + 300_000);
    expect(prices.get(35)?.source).toBe('esi');
    expect(prices.size).toBe(3);
  });

  it('does not make an expired fallback fresh when its legacy expiry is still in the future', async () => {
    const row = { ...seed(34), updatedAt: new Date(Date.now() - 600_000), staleAfter: new Date(Date.now() + 86_400_000) };
    getPricesMock.mockResolvedValue(new Map([[34, row]]));
    sourceByTypeId({}, { throwFor: [34] });
    const { prices } = await getLivePrices([34]);
    expect(prices.get(34)?.updatedAt).toEqual(row.updatedAt);
    expect(prices.get(34)!.staleAfter.getTime()).toBeLessThan(Date.now());
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('reuses a confirmed empty market book until it expires', async () => {
    const row = { ...seed(34), bestBuy: null, bestSell: null, updatedAt: new Date(), staleAfter: new Date(Date.now() + 300_000) };
    getPricesMock.mockResolvedValue(new Map([[34, row]]));
    const { prices } = await getLivePrices([34]);
    expect(prices.get(34)?.bestSell).toBeNull();
    expect(fetchPricesFromSourceMock).not.toHaveBeenCalled();
  });

  it('refreshes a newly seeded placeholder despite its recent updatedAt', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, { ...seed(34), updatedAt: new Date(), staleAfter: new Date(0) }]]));
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    const { prices } = await getLivePrices([34]);
    expect(prices.get(34)?.source).toBe('esi');
    expect(fetchPricesFromSourceMock).toHaveBeenCalledTimes(1);
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
      35: { prices: [] },
    });

    await getLivePrices([34, 35]);

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0]![0]();
    expect(persistPricesMock).toHaveBeenCalledTimes(1);
    const persisted = persistPricesMock.mock.calls[0]![1] as RawMarketPrice[];
    expect(persisted.map((r) => r.typeId)).toEqual([34]);
  });

  it('keeps the original source timestamp when write-behind runs after the response', async () => {
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    const { prices } = await getLivePrices([34]);
    await afterMock.mock.calls[0]![0]();
    expect(persistPricesMock.mock.calls[0]![2].fetchedAtByType.get(34)).toEqual(prices.get(34)!.updatedAt);
  });

  it('reports the asynchronous write-behind outcome through the optional observer', async () => {
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    persistPricesMock.mockResolvedValue({ written: 1 });
    const observer = vi.fn();

    await getLivePrices([34], observer);
    await afterMock.mock.calls[0]![0]();

    expect(observer).toHaveBeenCalledWith({
      outcome: 'succeeded',
      attempted: 1,
      written: 1,
      durationMs: expect.any(Number),
    });
  });

  it('does not turn an observer failure into a write-behind failure', async () => {
    sourceByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    persistPricesMock.mockResolvedValue({ written: 1 });
    const observer = vi.fn(() => {
      throw new Error('observer failed');
    });

    await getLivePrices([34], observer);
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(observer).toHaveBeenCalledTimes(1);
    expect(persistPricesMock).toHaveBeenCalledTimes(1);
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
