import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiResponseMeta } from '@/data/esi-store';
import type { MarketPrice, RawMarketPrice } from './types';

const fetchPricesPerTypeMock = vi.fn();
const getPricesMock = vi.fn();
const persistPricesMock = vi.fn();
const storedExpiriesMock = vi.fn();
const commitMock = vi.fn();
const afterMock = vi.fn();

vi.mock('./source', () => ({
  fetchPricesPerType: (...args: unknown[]) => fetchPricesPerTypeMock(...args),
}));
vi.mock('./queries', () => ({
  getPrices: (...args: unknown[]) => getPricesMock(...args),
}));
vi.mock('./ingest', () => ({
  persistPrices: (...args: unknown[]) => persistPricesMock(...args),
}));
vi.mock('@/data/esi-store', async () => ({
  ...(await vi.importActual<typeof import('@/data/esi-store/expiry')>('@/data/esi-store/expiry')),
  storedExpiries: (...args: unknown[]) => storedExpiriesMock(...args),
  commit: (...args: unknown[]) => commitMock(...args),
}));
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));
vi.mock('@/db', () => ({ db: {} }));

import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { priceKey } from './keys';
import { getLivePrices } from './refresh-on-view';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const EXPIRES = NOW + 300_000;

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

function meta(typeId: number, checkedAt = NOW - 1000): EsiResponseMeta {
  return { key: priceKey(typeId), expiresAt: EXPIRES, etags: ['"e"'], lastModified: null, checkedAt };
}

/** The store's answer per type: an expiry, or null when it has no row. */
function expiries(byId: Record<number, number | null>) {
  storedExpiriesMock.mockImplementation((keys: { params: { type_id: number } }[]) =>
    Promise.resolve(keys.map((key) => byId[key.params.type_id] ?? null)),
  );
}

function source(prices: RawMarketPrice[], opts: { budgetExhausted?: boolean; metas?: EsiResponseMeta[] } = {}) {
  fetchPricesPerTypeMock.mockResolvedValue({
    prices,
    budgetExhausted: opts.budgetExhausted ?? false,
    metaByType: new Map((opts.metas ?? prices.filter((p) => p.source === 'esi').map((p) => meta(p.typeId))).map((m) => [m.key.params!.type_id as number, m])),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchPricesPerTypeMock.mockReset();
  getPricesMock.mockReset().mockResolvedValue(new Map());
  persistPricesMock.mockReset().mockResolvedValue({ written: 1 });
  storedExpiriesMock.mockReset();
  commitMock.mockReset().mockResolvedValue(undefined);
  afterMock.mockReset();
  expiries({});
});

describe('getLivePrices', () => {
  it('returns the live value over the seed, stamped with CCP\'s expiry', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    source([raw(34, 'esi')]);

    const { prices, degraded, metrics } = await getLivePrices([34]);

    const row = prices.get(34)!;
    expect(row.source).toBe('esi');
    expect(row.bestBuy).toBe(10);
    expect(row.updatedAt.getTime()).toBe(NOW - 1000);
    expect(row.staleAfter?.getTime()).toBe(EXPIRES);
    expect(fetchPricesPerTypeMock).toHaveBeenCalledWith([34]);
    expect(degraded).toMatchObject({ fetched: 1, esiCount: 1, fuzzworkFallbackCount: 0 });
    expect(metrics).toEqual({ requested: 1, returned: 1, esiCount: 1, fuzzworkFallbackCount: 0 });
  });

  it('serves a Neon row whose stored answer is unexpired without asking the source or writing', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    expiries({ 34: NOW + 240_000 });

    const { prices, metrics } = await getLivePrices([34]);

    expect(prices.get(34)).toEqual({ ...seed(34), staleAfter: new Date(NOW + 240_000) });
    expect(metrics).toEqual({ requested: 1, returned: 1, esiCount: 0, fuzzworkFallbackCount: 0 });
    expect(fetchPricesPerTypeMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('reads the seed only after the expiries resolve, so a newer expiry never vouches for an older row', async () => {
    const pending = Promise.withResolvers<(number | null)[]>();
    storedExpiriesMock.mockReturnValue(pending.promise);
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)], [35, seed(35)]]));
    source([raw(34, 'esi')]);

    const read = getLivePrices([34, 35]);
    await Promise.resolve();

    // Nothing reads the seed while the expiry read is in flight.
    expect(getPricesMock).not.toHaveBeenCalled();
    expect(fetchPricesPerTypeMock).not.toHaveBeenCalled();
    pending.resolve([NOW - 1000, EXPIRES]);

    const { prices } = await read;
    expect(storedExpiriesMock.mock.invocationCallOrder[0]).toBeLessThan(getPricesMock.mock.invocationCallOrder[0]!);
    expect(getPricesMock).toHaveBeenCalledOnce();
    expect(fetchPricesPerTypeMock).toHaveBeenCalledWith([34]);
    expect(prices.get(34)?.source).toBe('esi');
    expect(prices.get(35)?.staleAfter?.getTime()).toBe(EXPIRES);
  });

  it('asks only for the types whose stored answer is missing or expired', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)], [35, seed(35)]]));
    expiries({ 34: NOW + 1, 35: NOW });
    source([raw(35, 'esi'), raw(36, 'esi')]);

    const { prices } = await getLivePrices([34, 35, 36]);

    expect(fetchPricesPerTypeMock).toHaveBeenCalledWith([35, 36]);
    expect(prices.get(34)?.source).toBe('fuzzwork');
    expect(prices.get(35)?.source).toBe('esi');
    expect(prices.size).toBe(3);
  });

  it('stamps a Fuzzwork row with its fetch time, since it has no ESI expiry and is due again at once', async () => {
    source([raw(34, 'fuzzwork-fallback')], { budgetExhausted: true });

    const { prices, degraded } = await getLivePrices([34]);

    expect(prices.get(34)?.updatedAt.getTime()).toBe(NOW);
    expect(prices.get(34)?.staleAfter?.getTime()).toBe(NOW);
    expect(degraded).toEqual({ fetched: 1, esiCount: 0, fuzzworkFallbackCount: 1, budgetExhausted: true });
  });

  it('falls back to the seed, marked due, when the source has nothing for a due type', async () => {
    getPricesMock.mockResolvedValue(new Map([[34, seed(34)]]));
    expiries({ 34: NOW - 60_000 });
    source([]);

    const { prices, degraded } = await getLivePrices([34]);

    expect(prices.get(34)).toEqual({ ...seed(34), staleAfter: new Date(NOW - 60_000) });
    expect(degraded.fetched).toBe(0);
    expect(afterMock).not.toHaveBeenCalled();

    // A type with neither a live nor a seed price is omitted.
    const { prices: unknown } = await getLivePrices([99]);
    expect(unknown.has(99)).toBe(false);
  });

  it('writes the fetched rows behind the response, then commits their metas under the dataset tag', async () => {
    getPricesMock.mockResolvedValue(new Map([[35, seed(35)]]));
    expiries({ 35: NOW + 1 });
    source([raw(34, 'esi'), raw(36, 'fuzzwork-fallback')]);

    const { prices } = await getLivePrices([34, 35, 36]);

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0]![0]();
    expect(persistPricesMock).toHaveBeenCalledTimes(1);
    const [, persisted, stamps] = persistPricesMock.mock.calls[0]!;
    expect((persisted as RawMarketPrice[]).map((r) => r.typeId)).toEqual([34, 36]);
    expect(stamps.fetchedAtByType.get(34)).toEqual(prices.get(34)!.updatedAt);
    expect(stamps.staleAfterByType.get(34)).toEqual(new Date(EXPIRES));
    expect(stamps.staleAfterByType.get(36)).toEqual(new Date(NOW));
    expect(commitMock).toHaveBeenCalledWith([meta(34)], { tag: 'eve:market_prices' });
  });

  it('reports the write-behind outcome through the optional observer and records nothing when the write fails', async () => {
    source([raw(34, 'esi')]);
    const observer = vi.fn();

    await getLivePrices([34], observer);
    await afterMock.mock.calls[0]![0]();
    expect(observer).toHaveBeenCalledWith({ outcome: 'succeeded', attempted: 1, written: 1, durationMs: expect.any(Number) });

    const errorSpy = silenceConsolePrefixes('error', ['[market-prices/refresh-on-view] write-behind failed']);
    persistPricesMock.mockRejectedValueOnce(new Error('neon: connection terminated'));
    commitMock.mockClear();
    await getLivePrices([34], observer);
    await afterMock.mock.calls[1]![0]();
    expect(observer).toHaveBeenLastCalledWith({ outcome: 'failed', attempted: 1, written: 0, durationMs: expect.any(Number) });
    expect(commitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[market-prices/refresh-on-view] write-behind failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('dedupes type ids before reading the seed, the store and the source', async () => {
    source([raw(34, 'esi')]);
    await getLivePrices([34, 34]);
    expect(getPricesMock).toHaveBeenCalledWith([34]);
    expect(storedExpiriesMock).toHaveBeenCalledWith([priceKey(34)]);
    expect(fetchPricesPerTypeMock).toHaveBeenCalledWith([34]);
  });

  it('returns empty without touching seed, store, source, or write-behind on empty input', async () => {
    const { prices, degraded, metrics } = await getLivePrices([]);
    expect(prices.size).toBe(0);
    expect(degraded).toEqual({ fetched: 0, esiCount: 0, fuzzworkFallbackCount: 0, budgetExhausted: false });
    expect(metrics).toEqual({ requested: 0, returned: 0, esiCount: 0, fuzzworkFallbackCount: 0 });
    expect(getPricesMock).not.toHaveBeenCalled();
    expect(storedExpiriesMock).not.toHaveBeenCalled();
    expect(fetchPricesPerTypeMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});
