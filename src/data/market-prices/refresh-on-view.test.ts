import { beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { MarketPrice, RawMarketPrice } from './types';

const MARKET_PRICE_WINDOW_MS = freshnessGate('market_prices').ttlMs;

const fetchPricesFromEsiPerTypeMock = vi.fn();
const fetchFuzzworkFallbackMock = vi.fn();
const getPricesMock = vi.fn();
const persistPricesMock = vi.fn();
const afterMock = vi.fn();
const consumeFreshPriceResolutionMock = vi.fn();

vi.mock('./source', () => ({
  fetchPricesFromEsiPerType: (...args: unknown[]) => fetchPricesFromEsiPerTypeMock(...args),
  fetchFuzzworkFallback: (...args: unknown[]) => fetchFuzzworkFallbackMock(...args),
}));
// A consumed resolution id means this call ran the cached function itself; an
// unconsumed one means the remote cache answered.
vi.mock('./cache-resolution', () => ({
  markFreshPriceResolution: () => 'resolution',
  consumeFreshPriceResolution: (...args: unknown[]) => consumeFreshPriceResolutionMock(...args),
}));
vi.mock('./queries', () => ({
  getPrices: (...args: unknown[]) => getPricesMock(...args),
}));
vi.mock('./ingest', () => ({
  persistPrices: (...args: unknown[]) => persistPricesMock(...args),
}));
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('@/db', () => ({ db: {} }));

import { getLivePrices } from './refresh-on-view';

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

/** Scripts the per-type ESI read: `failed` ids come back unpriced for the Fuzzwork fallback. */
function esiByTypeId(
  byId: Record<number, { prices?: RawMarketPrice[]; failed?: boolean; budgetExhausted?: boolean }>,
  opts?: { throwFor?: number[] },
) {
  fetchPricesFromEsiPerTypeMock.mockImplementation((ids: number[]) => {
    const id = ids[0]!;
    if (opts?.throwFor?.includes(id)) return Promise.reject(new Error('cache down'));
    const r = byId[id] ?? {};
    return Promise.resolve({
      prices: r.prices ?? [],
      failed: r.failed ? [id] : [],
      budgetExhausted: r.budgetExhausted ?? false,
    });
  });
}

/** Scripts Fuzzwork to price every requested id it has a row for. */
function fuzzworkPrices(...typeIds: number[]) {
  fetchFuzzworkFallbackMock.mockImplementation((ids: number[]) =>
    Promise.resolve(ids.filter((id) => typeIds.includes(id)).map((id) => raw(id, 'fuzzwork-fallback'))),
  );
}

beforeEach(() => {
  fetchPricesFromEsiPerTypeMock.mockReset();
  fetchFuzzworkFallbackMock.mockReset();
  fetchFuzzworkFallbackMock.mockResolvedValue([]);
  getPricesMock.mockReset();
  persistPricesMock.mockReset();
  afterMock.mockReset();
  consumeFreshPriceResolutionMock.mockReset();
  consumeFreshPriceResolutionMock.mockReturnValue(true);
  persistPricesMock.mockResolvedValue({ written: 1 });
  getPricesMock.mockResolvedValue(new Map());
});

describe('getLivePrices', () => {
  it('returns the live value over the seed and stamps a fresh expiry', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });

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
    expect(fetchPricesFromEsiPerTypeMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('refreshes only stale or missing rows and ignores legacy 24-hour expiry', async () => {
    const now = Date.now();
    const fresh = { ...seed(34), updatedAt: new Date(now - 60_000), staleAfter: new Date(now + 86_400_000) };
    const stale = { ...seed(35), updatedAt: new Date(now - 300_000), staleAfter: new Date(now + 86_400_000) };
    getPricesMock.mockResolvedValue(new Map([[34, fresh], [35, stale]]));
    esiByTypeId({ 35: { prices: [raw(35, 'esi')] }, 36: { prices: [raw(36, 'esi')] } });
    const { prices } = await getLivePrices([34, 35, 36]);
    expect(fetchPricesFromEsiPerTypeMock.mock.calls.map(([ids]) => ids)).toEqual([[35], [36]]);
    expect(fetchFuzzworkFallbackMock).not.toHaveBeenCalled();
    expect(prices.get(34)?.staleAfter.getTime()).toBe(fresh.updatedAt.getTime() + 300_000);
    expect(prices.get(35)?.source).toBe('esi');
    expect(prices.size).toBe(3);
  });

  it('does not make an expired fallback fresh when its legacy expiry is still in the future', async () => {
    const row = { ...seed(34), updatedAt: new Date(Date.now() - 600_000), staleAfter: new Date(Date.now() + 86_400_000) };
    getPricesMock.mockResolvedValue(new Map([[34, row]]));
    esiByTypeId({}, { throwFor: [34] });
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
    expect(fetchPricesFromEsiPerTypeMock).not.toHaveBeenCalled();
  });

  it('refreshes a newly seeded placeholder despite its recent updatedAt', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, { ...seed(34), updatedAt: new Date(), staleAfter: new Date(0) }]]));
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    const { prices } = await getLivePrices([34]);
    expect(prices.get(34)?.source).toBe('esi');
    expect(fetchPricesFromEsiPerTypeMock).toHaveBeenCalledTimes(1);
  });

  it('sends a type whose live fetch throws to Fuzzwork and keeps the seed when Fuzzwork has no row', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    esiByTypeId({}, { throwFor: [34] });

    const { prices, degraded } = await getLivePrices([34]);

    expect(fetchFuzzworkFallbackMock).toHaveBeenCalledWith([34]);
    expect(prices.get(34)).toEqual(seed(34));
    expect(degraded.fetched).toBe(0);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('prices every type ESI failed with one Fuzzwork call and writes those rows behind', async () => {
    getPricesMock.mockResolvedValue(new Map([[37, seed(37)]]));
    esiByTypeId({
      34: { prices: [raw(34, 'esi')] },
      35: { failed: true },
      36: { failed: true },
      37: { failed: true },
    });
    fuzzworkPrices(35, 36);

    const { prices, degraded, metrics } = await getLivePrices([34, 35, 36, 37]);

    expect(fetchFuzzworkFallbackMock.mock.calls).toEqual([[[35, 36, 37]]]);
    expect([34, 35, 36, 37].map((id) => prices.get(id)?.source)).toEqual([
      'esi',
      'fuzzwork-fallback',
      'fuzzwork-fallback',
      'fuzzwork',
    ]);
    expect(prices.get(37)).toEqual(seed(37));
    const fallback = prices.get(35)!;
    expect(fallback.staleAfter.getTime() - fallback.updatedAt.getTime()).toBe(MARKET_PRICE_WINDOW_MS);
    expect(degraded).toEqual({ fetched: 3, esiCount: 1, fuzzworkFallbackCount: 2, budgetExhausted: false });
    expect(metrics).toEqual({ requested: 4, returned: 4, cacheHits: 0, esiCount: 1, fuzzworkFallbackCount: 2 });

    await afterMock.mock.calls[0]![0]();
    const persisted = persistPricesMock.mock.calls[0]![1] as RawMarketPrice[];
    expect(persisted.map((r) => r.typeId)).toEqual([34, 35, 36]);
    expect(persistPricesMock.mock.calls[0]![2].fetchedAtByType.get(35)).toEqual(fallback.updatedAt);
  });

  it('keeps the seed and logs once when the batched Fuzzwork call fails', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    esiByTypeId({ 34: { failed: true }, 35: { failed: true } });
    const failure = new Error('fuzzwork down');
    fetchFuzzworkFallbackMock.mockRejectedValue(failure);
    const errors = silenceConsolePrefixes('error', ['[market-prices/refresh-on-view] ']);

    const { prices, degraded } = await getLivePrices([34, 35]);

    expect(fetchFuzzworkFallbackMock).toHaveBeenCalledTimes(1);
    expect(prices.get(34)).toEqual(seed(34));
    expect(prices.has(35)).toBe(false);
    expect(degraded.fetched).toBe(0);
    expect(afterMock).not.toHaveBeenCalled();
    expect(errors.mock.calls).toEqual([
      ['[market-prices/refresh-on-view] Fuzzwork fallback failed', failure],
    ]);
    errors.mockRestore();
  });

  it('counts a Fuzzwork row as a fresh fetch even when the ESI failure came from the cache', async () => {
    consumeFreshPriceResolutionMock.mockReturnValue(false);
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] }, 35: { failed: true } });
    fuzzworkPrices(35);

    const { metrics } = await getLivePrices([34, 35]);

    expect(metrics).toEqual({ requested: 2, returned: 2, cacheHits: 1, esiCount: 0, fuzzworkFallbackCount: 1 });
  });

  it('falls back to the seed when the source returns no row', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    esiByTypeId({ 34: { prices: [] } });

    const { prices } = await getLivePrices([34]);

    expect(prices.get(34)).toEqual(seed(34));
  });

  it('omits a type with neither a live nor a seed price', async () => {
    esiByTypeId({ 99: { prices: [] } });
    const { prices } = await getLivePrices([99]);
    expect(prices.has(99)).toBe(false);
  });

  it('schedules write-behind with only the freshly fetched rows', async () => {
    getPricesMock.mockResolvedValue(new Map([[35, seed(35)]]));
    esiByTypeId({
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
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    const { prices } = await getLivePrices([34]);
    await afterMock.mock.calls[0]![0]();
    expect(persistPricesMock.mock.calls[0]![2].fetchedAtByType.get(34)).toEqual(prices.get(34)!.updatedAt);
  });

  it('reports the asynchronous write-behind outcome through the optional observer', async () => {
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });
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
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    persistPricesMock.mockResolvedValue({ written: 1 });
    const failure = new Error('observer failed');
    const observer = vi.fn(() => {
      throw failure;
    });
    const errors = silenceConsolePrefixes('error', ['[market-prices/refresh-on-view] ']);

    await getLivePrices([34], observer);
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(observer).toHaveBeenCalledTimes(1);
    expect(persistPricesMock).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls).toEqual([
      ['[market-prices/refresh-on-view] write-behind observer failed', failure],
    ]);
    errors.mockRestore();
  });

  it('reports a rejected write-behind as failed with nothing written', async () => {
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    const failure = new Error('database down');
    persistPricesMock.mockRejectedValue(failure);
    const observer = vi.fn();
    const errors = silenceConsolePrefixes('error', ['[market-prices/refresh-on-view] ']);

    const { prices } = await getLivePrices([34], observer);
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(prices.get(34)?.source).toBe('esi');
    expect(observer).toHaveBeenCalledWith({
      outcome: 'failed',
      attempted: 1,
      written: 0,
      durationMs: expect.any(Number),
    });
    expect(errors.mock.calls).toEqual([
      ['[market-prices/refresh-on-view] write-behind failed', failure],
    ]);
    errors.mockRestore();
  });

  it('tallies esi vs fuzzwork-fallback and budget exhaustion across items', async () => {
    esiByTypeId({
      34: { prices: [raw(34, 'esi')] },
      35: { failed: true, budgetExhausted: true },
    });
    fuzzworkPrices(35);

    const { degraded, metrics } = await getLivePrices([34, 35]);

    expect(degraded).toEqual({
      fetched: 2,
      esiCount: 1,
      fuzzworkFallbackCount: 1,
      budgetExhausted: true,
    });
    expect(metrics).toMatchObject({ esiCount: 1, fuzzworkFallbackCount: 1 });
  });

  it('dedupes type ids before reading seed and source', async () => {
    esiByTypeId({ 34: { prices: [raw(34, 'esi')] } });
    await getLivePrices([34, 34]);
    expect(getPricesMock).toHaveBeenCalledWith([34]);
    expect(fetchPricesFromEsiPerTypeMock).toHaveBeenCalledTimes(1);
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
    expect(fetchPricesFromEsiPerTypeMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});
