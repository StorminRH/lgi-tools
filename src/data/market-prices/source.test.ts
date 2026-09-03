import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BULK_THRESHOLD } from './constants';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import { computeDepth, computeSide, fetchPricesFromSource } from './source';
import type { RawMarketPrice } from './types';

vi.mock('@/platform/esi', async () => {
  const actual =
    await vi.importActual<typeof import('@/platform/esi')>('@/platform/esi');
  return {
    ...actual,
    esiFetch: vi.fn(),
  };
});

vi.mock('./source-fallback', () => ({
  fetchPricesFromFuzzwork: vi.fn(),
}));

import { esiFetch } from '@/platform/esi';
import { fetchPricesFromFuzzwork } from './source-fallback';

const JITA_44 = 60003760;
const JITA_SYSTEM = 30000142;

interface SyntheticOrder {
  type_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;

  location_id?: number;
  system_id?: number;
}

function ordersResponse(orders: SyntheticOrder[], xPages = '1'): Response {
  const filled = orders.map((o) => ({
    location_id: JITA_44,
    system_id: JITA_SYSTEM,
    ...o,
  }));
  return new Response(JSON.stringify(filled), {
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
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
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

    const orders = [
      { price: 2.8, volume: BigInt(50_000_000) },
      { price: 2.85, volume: BigInt(120_000_000) },
      { price: 2.93, volume: BigInt(800_000_000) },
      { price: 2.95, volume: BigInt(300_000_000) },
      { price: 3.5, volume: BigInt(14_000_000_000) },
    ];
    const res = computeSide(orders, 'asc');
    expect(res.best).toBe(2.8);

    expect(res.pct5).toBeGreaterThan(2.9);
    expect(res.pct5).toBeLessThan(2.95);
  });

  describe('dust-filtered best', () => {
    it('sell side: skips a run of 1-unit sliver asks and lands on the real book front', () => {

      const orders = [
        { price: 90.0, volume: BigInt(1) },
        { price: 90.01, volume: BigInt(1) },
        { price: 90.02, volume: BigInt(1) },
        { price: 90.03, volume: BigInt(1) },
        { price: 90.04, volume: BigInt(1) },
        { price: 100, volume: BigInt(3_000) },
        { price: 101, volume: BigInt(5_000) },
      ];
      const res = computeSide(orders, 'asc');
      expect(res.best).toBe(100);

      const expectedPct5 = (90.0 + 90.01 + 90.02 + 90.03 + 90.04 + 396 * 100) / 401;
      expect(res.pct5).toBeCloseTo(expectedPct5, 6);
      expect(res.volume).toBe(BigInt(8_005));
    });

    it('sell side: corrects a mid-gap single sliver (Ishtar-shaped)', () => {

      const orders = [
        { price: 94.4, volume: BigInt(1) },
        { price: 100, volume: BigInt(300) },
        { price: 101, volume: BigInt(4_700) },
      ];
      const res = computeSide(orders, 'asc');
      expect(res.best).toBe(100);
    });

    it('buy side: skips a 1-unit sliver highball bid over a real wall', () => {

      const orders = [
        { price: 120, volume: BigInt(1) },
        { price: 100, volume: BigInt(1_500) },
        { price: 99.5, volume: BigInt(500) },
      ];
      const res = computeSide(orders, 'desc');
      expect(res.best).toBe(100);
    });

    it('keeps the raw touch on a small book where dust cannot be told from real', () => {

      const orders = [
        { price: 50, volume: BigInt(1) },
        { price: 60, volume: BigInt(300) },
      ];
      const res = computeSide(orders, 'asc');
      expect(res.best).toBe(50);
    });
  });
});

describe('computeDepth', () => {

  const bandPct = (d: NonNullable<ReturnType<typeof computeDepth>>, pct: number) =>
    d.find((b) => b.pct === pct)!.cumVolume;

  it('returns null for an empty side or a null best', () => {
    expect(computeDepth([], 'asc', null)).toBeNull();
    expect(computeDepth([{ price: 5, volume: BigInt(1) }], 'asc', null)).toBeNull();
  });

  it('sell side: accumulates volume within each band above the best ask', () => {

    const orders = [
      { price: 100, volume: BigInt(10) },
      { price: 100.4, volume: BigInt(5) },
      { price: 101.5, volume: BigInt(20) },
      { price: 104, volume: BigInt(30) },
      { price: 130, volume: BigInt(999) },
    ];
    const d = computeDepth(orders, 'asc', 100)!;
    expect(bandPct(d, 0.5)).toBe(15);
    expect(bandPct(d, 1)).toBe(15);
    expect(bandPct(d, 2)).toBe(35);
    expect(bandPct(d, 5)).toBe(65);
    expect(bandPct(d, 10)).toBe(65);
  });

  it('buy side: accumulates volume within each band below the best bid', () => {

    const orders = [
      { price: 100, volume: BigInt(10) },
      { price: 99.6, volume: BigInt(5) },
      { price: 98.5, volume: BigInt(20) },
      { price: 96, volume: BigInt(30) },
      { price: 80, volume: BigInt(999) },
    ];
    const d = computeDepth(orders, 'desc', 100)!;
    expect(bandPct(d, 0.5)).toBe(15);
    expect(bandPct(d, 2)).toBe(35);
    expect(bandPct(d, 5)).toBe(65);
    expect(bandPct(d, 10)).toBe(65);
  });

  it('is robust to a tiny 0.01-ISK top-of-book spoof (buy side)', () => {

    const real = [
      { price: 99.99, volume: BigInt(500) },
      { price: 99.95, volume: BigInt(500) },
    ];
    const honest = computeDepth(real, 'desc', 99.99)!;

    const spoofed = [{ price: 100, volume: BigInt(1) }, ...real];
    const attacked = computeDepth(spoofed, 'desc', 100)!;

    expect(bandPct(attacked, 0.5)).toBe(1001);
    expect(bandPct(honest, 0.5)).toBe(1000);

    expect(bandPct(attacked, 0.5)).toBeGreaterThan(900);
  });

  it('anchored to the dust-filtered best, the ladder captures the real book a sliver anchor excluded', () => {

    const orders = [
      { price: 90, volume: BigInt(1) },
      { price: 100, volume: BigInt(3_000) },
      { price: 100.4, volume: BigInt(5_000) },
    ];

    const sliverAnchored = computeDepth(orders, 'asc', 90)!;
    expect(bandPct(sliverAnchored, 10)).toBe(1);

    const hardenedBest = computeSide(orders, 'asc').best;
    expect(hardenedBest).toBe(100);
    const hardened = computeDepth(orders, 'asc', hardenedBest)!;

    expect(bandPct(hardened, 0.5)).toBe(8_001);
    expect(bandPct(hardened, 10)).toBe(8_001);
  });

  it('under-states (never over-states) depth under a far-out whale order', () => {

    const real = [
      { price: 100, volume: BigInt(500) },
      { price: 99.5, volume: BigInt(500) },
    ];

    const whale = [{ price: 200, volume: BigInt(10_000_000) }, ...real];
    const d = computeDepth(whale, 'desc', 200)!;

    expect(bandPct(d, 10)).toBe(10_000_000);

    expect(bandPct(d, 0.5)).toBe(10_000_000);
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

    const { prices: result, budgetExhausted } = await fetchPricesFromSource([34, 35]);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.source === 'esi')).toBe(true);
    expect(budgetExhausted).toBe(false);
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

    const { prices: result } = await fetchPricesFromSource([10, 20, 30, 99]);

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

    const { prices: result, budgetExhausted } = await fetchPricesFromSource([1, 2, 3, 4, 5]);

    expect(result).toHaveLength(5);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);

    expect(budgetExhausted).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledOnce();

    const calledWith = vi.mocked(fetchPricesFromFuzzwork).mock.calls[0]![0];
    expect([...calledWith].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('routes a malformed ESI body to Fuzzwork fallback (per-type path)', async () => {

    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const id = Number(/type_id=(\d+)/.exec(url)![1]);
      if (id === 77) {
        return new Response(JSON.stringify({ unexpected: 'shape' }), {
          status: 200,
        });
      }
      return ordersResponse([
        { type_id: id, is_buy_order: true, price: 1, volume_remain: 1 },
        { type_id: id, is_buy_order: false, price: 2, volume_remain: 1 },
      ]);
    });
    vi.mocked(fetchPricesFromFuzzwork).mockResolvedValue([fuzzworkRow(77)]);

    const { prices: result } = await fetchPricesFromSource([10, 20, 77]);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.source).sort()).toEqual([
      'esi',
      'esi',
      'fuzzwork-fallback',
    ]);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith([77]);
  });

  it('emits a row with null prices for a type that ESI returns no orders for', async () => {
    vi.mocked(esiFetch).mockResolvedValue(ordersResponse([]));

    const { prices: result } = await fetchPricesFromSource([42]);
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

  function bulkTypeIds(): number[] {
    return Array.from({ length: BULK_THRESHOLD + 20 }, (_, i) => 1000 + i);
  }

  it('streams orders across 3 pages and aggregates per type', async () => {
    const pageOrders: Record<number, SyntheticOrder[]> = {
      1: [
        { type_id: 1000, is_buy_order: true, price: 50, volume_remain: 10 },
        { type_id: 1001, is_buy_order: false, price: 200, volume_remain: 5 },
        { type_id: 9999, is_buy_order: true, price: 99, volume_remain: 1 },
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

    const { prices: result, budgetExhausted } = await fetchPricesFromSource(bulkTypeIds());

    expect(result).toHaveLength(BULK_THRESHOLD + 20);
    expect(result.every((r) => r.source === 'esi')).toBe(true);
    expect(budgetExhausted).toBe(false);

    const r1000 = result.find((r) => r.typeId === 1000)!;
    expect(r1000.bestBuy).toBe(55);
    expect(r1000.bestSell).toBe(60);
    expect(r1000.buyVolume).toBe(BigInt(30));
    expect(r1000.sellVolume).toBe(BigInt(100));

    const r1001 = result.find((r) => r.typeId === 1001)!;
    expect(r1001.bestBuy).toBe(180);
    expect(r1001.bestSell).toBe(200);
    expect(r1001.buyVolume).toBe(BigInt(40));
    expect(r1001.sellVolume).toBe(BigInt(55));

    expect(result.find((r) => r.typeId === 9999)).toBeUndefined();

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
    const { prices: result, budgetExhausted } = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);

    expect(budgetExhausted).toBe(false);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith(ids);
  });

  it('falls back to Fuzzwork when ESI bulk trips the budget floor', async () => {
    vi.mocked(esiFetch).mockRejectedValue(new EsiBudgetExhaustedError(10));
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const { prices: result, budgetExhausted } = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    expect(budgetExhausted).toBe(true);
  });

  it('stops dispatching new region-dump pages after one worker fails', async () => {

    let calls = 0;
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      calls++;
      if (url.includes('page=1') && !url.includes('page=10')) {

        return ordersResponse([], '100');
      }

      throw new EsiServerError(503);
    });
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const { prices: result } = await fetchPricesFromSource(ids);

    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);

    expect(calls).toBeLessThanOrEqual(20);
  });

  it('falls back to Fuzzwork when ESI bulk returns a malformed 200 body', async () => {

    vi.mocked(esiFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'nope' }), {
        status: 200,
        headers: { 'X-Pages': '1' },
      }),
    );
    vi.mocked(fetchPricesFromFuzzwork).mockImplementation(async (ids) =>
      ids.map(fuzzworkRow),
    );

    const ids = bulkTypeIds();
    const { prices: result } = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith(ids);
  });

  it('keeps streaming when a later page carries a malformed UNTRACKED order', async () => {

    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const page = Number(/page=(\d+)/.exec(url)?.[1] ?? '1');
      if (page === 1) {
        return ordersResponse(
          [{ type_id: 1000, is_buy_order: true, price: 50, volume_remain: 10 }],
          '2',
        );
      }

      return new Response(
        JSON.stringify([
          {
            type_id: 1001,
            is_buy_order: false,
            price: 200,
            volume_remain: 5,
            location_id: JITA_44,
            system_id: JITA_SYSTEM,
          },
          { type_id: 9999, is_buy_order: true, price: 'not-a-number', volume_remain: 1 },
        ]),
        { status: 200, headers: { 'X-Pages': '2' } },
      );
    });

    const { prices: result } = await fetchPricesFromSource(bulkTypeIds());

    expect(result.every((r) => r.source === 'esi')).toBe(true);
    expect(result.find((r) => r.typeId === 1000)!.bestBuy).toBe(50);
    expect(result.find((r) => r.typeId === 1001)!.bestSell).toBe(200);
    expect(result.find((r) => r.typeId === 9999)).toBeUndefined();
    expect(vi.mocked(fetchPricesFromFuzzwork)).not.toHaveBeenCalled();
  });

  it('falls back to Fuzzwork when ESI bulk returns a 4xx (non-array body)', async () => {

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
    const { prices: result } = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledWith(ids);
  });
});

describe('fetchPricesFromSource — hub scoping + regional discount (3.7.26.1)', () => {
  const NIYABAINEN_STATION = 60000004;
  const NIYABAINEN_SYSTEM = 30000143;

  it('prices from the Jita 4-4 book only and surfaces the remote book as a discount', async () => {

    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 255_000, volume_remain: 5_000 },
        { type_id: 42, is_buy_order: true, price: 200_000, volume_remain: 100 },
        {
          type_id: 42, is_buy_order: false, price: 28_000, volume_remain: 19,
          location_id: NIYABAINEN_STATION, system_id: NIYABAINEN_SYSTEM,
        },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    const row = prices[0]!;
    expect(row.bestSell).toBe(255_000);
    expect(row.sellVolume).toBe(BigInt(5_000));
    expect(row.bestBuy).toBe(200_000);
    expect(row.regionalDiscount).toEqual({
      systemId: NIYABAINEN_SYSTEM,
      price: 28_000,
      units: 19,
      pct: expect.closeTo(89.02, 1),
    });
  });

  it('drops remote BUY orders entirely — the ruled hub-station-only scope', async () => {

    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: true, price: 100, volume_remain: 50 },
        {
          type_id: 42, is_buy_order: true, price: 150, volume_remain: 1_000_000,
          location_id: NIYABAINEN_STATION, system_id: NIYABAINEN_SYSTEM,
        },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    expect(prices[0]!.bestBuy).toBe(100);
    expect(prices[0]!.buyVolume).toBe(BigInt(50));
  });

  it('never anchors a discount on a player structure', async () => {
    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 1_000, volume_remain: 500 },
        {
          type_id: 42, is_buy_order: false, price: 100, volume_remain: 5_000,
          location_id: 1_035_466_617_946, system_id: NIYABAINEN_SYSTEM,
        },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    expect(prices[0]!.bestSell).toBe(1_000);
    expect(prices[0]!.regionalDiscount).toBeNull();
  });

  it('stores null when no remote opportunity clears the gate — the byte-identical anchor', async () => {

    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 1_000, volume_remain: 500 },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    expect(prices[0]!.regionalDiscount).toBeNull();
  });

  it('an item with only remote sell orders goes null-priced with no discount', async () => {

    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        {
          type_id: 42, is_buy_order: false, price: 100, volume_remain: 5_000,
          location_id: NIYABAINEN_STATION, system_id: NIYABAINEN_SYSTEM,
        },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    expect(prices[0]!.bestSell).toBeNull();
    expect(prices[0]!.sellVolume).toBeNull();
    expect(prices[0]!.regionalDiscount).toBeNull();
  });
});

describe('fetchPricesFromSource — buy/sell spread floor', () => {
  it('drops a 1e9-at-0.01 hub wall so stored buy figures come from the real book', async () => {
    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 31_000, volume_remain: 200 },
        { type_id: 42, is_buy_order: true, price: 0.01, volume_remain: 1_000_000_000 },
        { type_id: 42, is_buy_order: true, price: 1.01, volume_remain: 100_000 },
        { type_id: 42, is_buy_order: true, price: 30_250, volume_remain: 80 },
        { type_id: 42, is_buy_order: true, price: 30_200, volume_remain: 40 },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    const row = prices[0]!;
    expect(row.bestSell).toBe(31_000);
    expect(row.bestBuy).toBe(30_250);
    expect(row.pct5Buy).toBeCloseTo(30_250, 0);
    expect(row.buyVolume).toBe(BigInt(120));
  });

  it('nulls the buy side when every hub bid fails the of-ask floor', async () => {
    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 31_000, volume_remain: 200 },
        { type_id: 42, is_buy_order: true, price: 0.01, volume_remain: 1_000_000_000 },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    expect(prices[0]!.bestSell).toBe(31_000);
    expect(prices[0]!.bestBuy).toBeNull();
    expect(prices[0]!.pct5Buy).toBeNull();
    expect(prices[0]!.buyVolume).toBeNull();
  });
});

describe('fetchPricesFromSource — dispatch', () => {
  it('returns [] for an empty type-ID list without calling ESI or Fuzzwork', async () => {
    const { prices: result } = await fetchPricesFromSource([]);
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

    const { prices: result } = await fetchPricesFromSource([5, 5, 5, 6, 6]);
    expect(result).toHaveLength(2);
    expect(vi.mocked(esiFetch).mock.calls).toHaveLength(2);
  });
});
