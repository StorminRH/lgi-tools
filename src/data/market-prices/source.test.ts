import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BULK_THRESHOLD } from './constants';
import { EsiBudgetExhaustedError, EsiServerError } from './esi-budget';
import { computeSide, fetchPricesFromSource } from './source';
import type { RawMarketPrice } from './types';

vi.mock('./esi-budget', async () => {
  const actual =
    await vi.importActual<typeof import('./esi-budget')>('./esi-budget');
  return {
    ...actual,
    esiFetch: vi.fn(),
  };
});

vi.mock('./source-fallback', () => ({
  fetchPricesFromFuzzwork: vi.fn(),
}));

import { esiFetch } from './esi-budget';
import { fetchPricesFromFuzzwork } from './source-fallback';

interface SyntheticOrder {
  type_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;
}

function ordersResponse(orders: SyntheticOrder[], xPages = '1'): Response {
  return new Response(JSON.stringify(orders), {
    status: 200,
    headers: { 'X-Pages': xPages },
  });
}

function fuzzworkRow(typeId: number): RawMarketPrice {
  return {
    typeId,
    bestBuy: 1.0,
    bestSell: 2.0,
    pct5Buy: 1.1,
    pct5Sell: 1.9,
    buyVolume: BigInt(100),
    sellVolume: BigInt(100),
    source: 'fuzzwork',
  };
}

beforeEach(() => {
  vi.mocked(esiFetch).mockReset();
  vi.mocked(fetchPricesFromFuzzwork).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('computeSide', () => {
  it('returns nulls for an empty side', () => {
    expect(computeSide([], 'asc')).toEqual({
      best: null,
      pct5: null,
      volume: null,
    });
  });

  it('sell side: pct5 is the volume-weighted average of the cheapest 5%', () => {
    // total = 1750; 5% (ceiling) = 88.
    // Take 50 @ 5.5, then 38 @ 5.6 → (50×5.5 + 38×5.6) / 88 = 525.8/88 ≈ 5.5432.
    const orders = [
      { price: 5.5, volume: BigInt(50) },
      { price: 5.6, volume: BigInt(200) },
      { price: 5.7, volume: BigInt(1000) },
      { price: 6.0, volume: BigInt(500) },
    ];
    const res = computeSide(orders, 'asc');
    expect(res.best).toBe(5.5);
    expect(res.pct5).toBeCloseTo(5.543, 3);
    expect(res.volume).toBe(BigInt(1750));
  });

  it('buy side: pct5 is the volume-weighted average of the most-expensive 5%', () => {
    // total = 1800; 5% = 90. Take 90 @ 5.2 → pct5 = 5.2.
    const orders = [
      { price: 5.2, volume: BigInt(100) },
      { price: 5.1, volume: BigInt(500) },
      { price: 5.0, volume: BigInt(1000) },
      { price: 4.9, volume: BigInt(200) },
    ];
    const res = computeSide(orders, 'desc');
    expect(res.best).toBe(5.2);
    expect(res.pct5).toBeCloseTo(5.2, 3);
    expect(res.volume).toBe(BigInt(1800));
  });

  it('handles a single-order side', () => {
    const res = computeSide([{ price: 9.99, volume: BigInt(10) }], 'asc');
    expect(res.best).toBe(9.99);
    expect(res.pct5).toBeCloseTo(9.99, 6);
    expect(res.volume).toBe(BigInt(10));
  });

  it('matches Fuzzwork-style pct5 for a Tritanium-shaped orderbook', () => {
    // Approximation of the cheapest end of Jita's Tritanium sell book.
    // The crossed-orderbook outlier at 2.80 has small volume; the bulk
    // of cheap volume sits at 2.93. Total ≈ 15.3B; 5% ≈ 765M.
    const orders = [
      { price: 2.8, volume: BigInt(50_000_000) },
      { price: 2.85, volume: BigInt(120_000_000) },
      { price: 2.93, volume: BigInt(800_000_000) },
      { price: 2.95, volume: BigInt(300_000_000) },
      { price: 3.5, volume: BigInt(14_000_000_000) },
    ];
    const res = computeSide(orders, 'asc');
    expect(res.best).toBe(2.8);
    // Heavy weight on the 2.93 bucket → pct5 lands close to it,
    // matching Fuzzwork's ~2.93 for the real orderbook.
    expect(res.pct5).toBeGreaterThan(2.9);
    expect(res.pct5).toBeLessThan(2.95);
  });
});

describe('fetchPricesFromSource — per-type path (below BULK_THRESHOLD)', () => {
  it('dispatches one ESI call per type and aggregates orders into RawMarketPrice rows', async () => {
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const m = /type_id=(\d+)/.exec(url);
      if (!m) throw new Error(`unexpected url: ${url}`);
      const id = Number(m[1]);
      return ordersResponse([
        { type_id: id, is_buy_order: true, price: 100, volume_remain: 50 },
        { type_id: id, is_buy_order: false, price: 110, volume_remain: 30 },
      ]);
    });

    const result = await fetchPricesFromSource([34, 35]);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.source === 'esi')).toBe(true);
    const r34 = result.find((r) => r.typeId === 34)!;
    expect(r34.bestBuy).toBe(100);
    expect(r34.bestSell).toBe(110);
    expect(r34.buyVolume).toBe(BigInt(50));
    expect(r34.sellVolume).toBe(BigInt(30));
    expect(vi.mocked(esiFetch).mock.calls).toHaveLength(2);
  });

  it('routes individual EsiServerError failures to Fuzzwork fallback (partial)', async () => {
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const m = /type_id=(\d+)/.exec(url);
      const id = Number(m![1]);
      if (id === 99) throw new EsiServerError(503);
      return ordersResponse([
        { type_id: id, is_buy_order: true, price: 1, volume_remain: 1 },
        { type_id: id, is_buy_order: false, price: 2, volume_remain: 1 },
      ]);
    });
    vi.mocked(fetchPricesFromFuzzwork).mockResolvedValue([fuzzworkRow(99)]);

    const result = await fetchPricesFromSource([10, 20, 30, 99]);

    expect(result).toHaveLength(4);
    const sources = result.map((r) => r.source).sort();
    expect(sources).toEqual([
      'esi',
      'esi',
      'esi',
      'fuzzwork-fallback',
    ]);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith([99]);
  });

  it('routes remaining types to Fuzzwork when ESI budget is exhausted mid-batch', async () => {
    vi.mocked(esiFetch).mockRejectedValue(new EsiBudgetExhaustedError(5));
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const result = await fetchPricesFromSource([1, 2, 3, 4, 5]);

    expect(result).toHaveLength(5);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledOnce();
    // All five typeIds present in the one Fuzzwork call (order may vary).
    const calledWith = vi.mocked(fetchPricesFromFuzzwork).mock.calls[0][0];
    expect([...calledWith].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('emits a row with null prices for a type that ESI returns no orders for', async () => {
    vi.mocked(esiFetch).mockResolvedValue(ordersResponse([]));

    const result = await fetchPricesFromSource([42]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      typeId: 42,
      bestBuy: null,
      bestSell: null,
      pct5Buy: null,
      pct5Sell: null,
      buyVolume: null,
      sellVolume: null,
      source: 'esi',
    });
  });
});

describe('fetchPricesFromSource — bulk path (≥ BULK_THRESHOLD types)', () => {
  // Synthesize a paginated region-dump response. The first call returns page
  // 1 with X-Pages: 3; subsequent calls return pages 2 and 3. Orders are
  // assigned to whatever pages we like — the aggregator merges across pages.
  function bulkTypeIds(): number[] {
    return Array.from({ length: BULK_THRESHOLD + 20 }, (_, i) => 1000 + i);
  }

  it('streams orders across 3 pages and aggregates per type', async () => {
    const pageOrders: Record<number, SyntheticOrder[]> = {
      1: [
        { type_id: 1000, is_buy_order: true, price: 50, volume_remain: 10 },
        { type_id: 1001, is_buy_order: false, price: 200, volume_remain: 5 },
        { type_id: 9999, is_buy_order: true, price: 99, volume_remain: 1 }, // not in wanted
      ],
      2: [
        { type_id: 1000, is_buy_order: true, price: 55, volume_remain: 20 },
        { type_id: 1000, is_buy_order: false, price: 60, volume_remain: 100 },
      ],
      3: [
        { type_id: 1001, is_buy_order: true, price: 180, volume_remain: 40 },
        { type_id: 1001, is_buy_order: false, price: 220, volume_remain: 50 },
      ],
    };

    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const m = /page=(\d+)/.exec(url);
      const page = m ? Number(m[1]) : 1;
      return ordersResponse(pageOrders[page] ?? [], '3');
    });

    const result = await fetchPricesFromSource(bulkTypeIds());

    expect(result).toHaveLength(BULK_THRESHOLD + 20);
    expect(result.every((r) => r.source === 'esi')).toBe(true);

    const r1000 = result.find((r) => r.typeId === 1000)!;
    expect(r1000.bestBuy).toBe(55); // max across pages 1+2
    expect(r1000.bestSell).toBe(60);
    expect(r1000.buyVolume).toBe(BigInt(30)); // 10 + 20
    expect(r1000.sellVolume).toBe(BigInt(100));

    const r1001 = result.find((r) => r.typeId === 1001)!;
    expect(r1001.bestBuy).toBe(180);
    expect(r1001.bestSell).toBe(200); // min across pages 1+3
    expect(r1001.buyVolume).toBe(BigInt(40));
    expect(r1001.sellVolume).toBe(BigInt(55)); // 5 + 50

    // Untracked type 9999 must not produce a row.
    expect(result.find((r) => r.typeId === 9999)).toBeUndefined();
    // Types with no orders still get a null-priced row.
    const r1050 = result.find((r) => r.typeId === 1050)!;
    expect(r1050.bestBuy).toBeNull();
    expect(r1050.bestSell).toBeNull();
  });

  it('falls back to Fuzzwork when ESI bulk returns a 5xx', async () => {
    vi.mocked(esiFetch).mockRejectedValue(new EsiServerError(503));
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const result = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith(ids);
  });

  it('falls back to Fuzzwork when ESI bulk trips the budget floor', async () => {
    vi.mocked(esiFetch).mockRejectedValue(new EsiBudgetExhaustedError(10));
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const result = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
  });

  it('stops dispatching new region-dump pages after one worker fails', async () => {
    // Without the runConcurrent cancellation flag, surviving workers would
    // drain the remaining ~500 pages against a known-failing endpoint,
    // burning ESI error budget toward the floor. The flag caps post-throw
    // dispatch at one extra item per surviving worker — so for a 100-page
    // synthetic region with PAGE_CONCURRENCY = 8, we should see at most
    // 1 (page 1 sync) + 8 (workers' first iteration) + 7 (workers'
    // possible second iteration in flight when cancel sets) = 16 calls,
    // not 100.
    let calls = 0;
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      calls++;
      if (url.includes('page=1') && !url.includes('page=10')) {
        // First page succeeds; report a 100-page region.
        return ordersResponse([], '100');
      }
      // Every subsequent page throws server error.
      throw new EsiServerError(503);
    });
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const result = await fetchPricesFromSource(ids);

    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    // Hard upper bound: cursor advancement plus in-flight workers when
    // the cancel flag flips. PAGE_CONCURRENCY = 8, so post-throw dispatch
    // is capped at 8 extra items. Pre-fix this assertion would see ~100.
    expect(calls).toBeLessThanOrEqual(20);
  });

  it('falls back to Fuzzwork when ESI bulk returns a 4xx (non-array body)', async () => {
    // `esiFetch` passes 4xx through as a non-ok Response whose JSON body
    // is an error object, not an array. Without the explicit res.ok
    // guard, `absorbOrders` would trip a TypeError trying to iterate the
    // error object — and TypeError isn't caught by the dispatcher's
    // EsiServerError / EsiBudgetExhaustedError guard, so the refresh
    // would crash instead of falling back.
    vi.mocked(esiFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Bad Request' }), {
        status: 400,
        headers: { 'X-Pages': '1' },
      }),
    );
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const result = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith(ids);
  });
});

describe('fetchPricesFromSource — dispatch', () => {
  it('returns [] for an empty type-ID list without calling ESI or Fuzzwork', async () => {
    const result = await fetchPricesFromSource([]);
    expect(result).toEqual([]);
    expect(vi.mocked(esiFetch)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchPricesFromFuzzwork)).not.toHaveBeenCalled();
  });

  it('deduplicates incoming type IDs', async () => {
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const m = /type_id=(\d+)/.exec(url);
      const id = Number(m![1]);
      return ordersResponse([
        { type_id: id, is_buy_order: true, price: 1, volume_remain: 1 },
      ]);
    });

    const result = await fetchPricesFromSource([5, 5, 5, 6, 6]);
    expect(result).toHaveLength(2);
    expect(vi.mocked(esiFetch).mock.calls).toHaveLength(2);
  });
});
