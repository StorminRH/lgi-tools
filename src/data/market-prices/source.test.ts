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
  // Location defaults to Jita 4-4 (filled in ordersResponse) so hub-book
  // behavior is the fixture baseline and remote placement is opt-in.
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
    // Approximation of the cheapest end of Jita's Tritanium sell book — the
    // template for the KEPT side of the dust rule (3.7.25.1). The crossed
    // outlier at 2.80 carries 50M units = 0.33% of the 15.27B-unit side, well
    // past the 0.1% dust threshold (~15.3M units): that is REAL, tradable
    // volume, so the hardened best keeps it. Contrast the sliver fixtures
    // below, where a 1-unit anchor is skipped.
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

  // The dust-filtered best (3.7.25.1) — the SKIPPED side of the rule. The
  // adversarial shapes come straight from the hardening report's findings:
  // 1-unit slivers anchoring 4,000–10,000-unit books ([1,1,1,1,1] ladders),
  // the Ishtar-shaped mid-gap single sliver, and the buy-side highball twin.
  // Healthy books are byte-identical by construction (every fixture above:
  // the front order alone carries the 0.1% threshold).
  describe('dust-filtered best', () => {
    it('sell side: skips a run of 1-unit sliver asks and lands on the real book front', () => {
      // Five 1-unit slivers ~10% under an 8,000-unit real book. Threshold =
      // ceil(0.1% × 8,005) = 9 > 5 sliver units → the real front (100) is the
      // order that carries cumulative volume across the line.
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
      // pct5 is untouched by the filter: it still walks from the raw front.
      // 5% of 8,005 = 401 (ceil): 5 units across the slivers + 396 @ 100.
      const expectedPct5 = (90.0 + 90.01 + 90.02 + 90.03 + 90.04 + 396 * 100) / 401;
      expect(res.pct5).toBeCloseTo(expectedPct5, 6);
      expect(res.volume).toBe(BigInt(8_005));
    });

    it('sell side: corrects a mid-gap single sliver (Ishtar-shaped)', () => {
      // One 1-unit ask ~5.6% under a 5,000-unit book — the ratio-0.94 class
      // the report pinned as "the same disease in miniature". Threshold =
      // ceil(0.1% × 5,001) = 6 > 1 → the sliver is skipped.
      const orders = [
        { price: 94.4, volume: BigInt(1) },
        { price: 100, volume: BigInt(300) },
        { price: 101, volume: BigInt(4_700) },
      ];
      const res = computeSide(orders, 'asc');
      expect(res.best).toBe(100);
    });

    it('buy side: skips a 1-unit sliver highball bid over a real wall', () => {
      // The buy-side twin (report §2.2's 35/280 sliver-highball class): a
      // 1-unit bid above a 2,000-unit wall. A volume filter handles it the
      // same way — never a pct5_buy clamp (pct5_buy is wall-diluted junk).
      const orders = [
        { price: 120, volume: BigInt(1) },
        { price: 100, volume: BigInt(1_500) },
        { price: 99.5, volume: BigInt(500) },
      ];
      const res = computeSide(orders, 'desc');
      expect(res.best).toBe(100);
    });

    it('keeps the raw touch on a small book where dust cannot be told from real', () => {
      // Side volume ≤ 1,000 → threshold = 1 → the front order always carries
      // it, even a 1-unit ask. In a thin book a single hull IS the market;
      // the <0.90 thin-order badge covers the honesty there, not the filter.
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
  // Bands are [0.5, 1, 2, 5, 10]% of best. cumVolume is monotonic non-decreasing.
  const bandPct = (d: NonNullable<ReturnType<typeof computeDepth>>, pct: number) =>
    d.find((b) => b.pct === pct)!.cumVolume;

  it('returns null for an empty side or a null best', () => {
    expect(computeDepth([], 'asc', null)).toBeNull();
    expect(computeDepth([{ price: 5, volume: BigInt(1) }], 'asc', null)).toBeNull();
  });

  it('sell side: accumulates volume within each band above the best ask', () => {
    // best ask = 100. Bands: ≤100.5, ≤101, ≤102, ≤105, ≤110.
    const orders = [
      { price: 100, volume: BigInt(10) }, // in all bands
      { price: 100.4, volume: BigInt(5) }, // ≤100.5 → all bands
      { price: 101.5, volume: BigInt(20) }, // first ≤102 band
      { price: 104, volume: BigInt(30) }, // first ≤105 band
      { price: 130, volume: BigInt(999) }, // outside 10% → no band
    ];
    const d = computeDepth(orders, 'asc', 100)!;
    expect(bandPct(d, 0.5)).toBe(15); // 10 + 5
    expect(bandPct(d, 1)).toBe(15);
    expect(bandPct(d, 2)).toBe(35); // + 20
    expect(bandPct(d, 5)).toBe(65); // + 30
    expect(bandPct(d, 10)).toBe(65); // 130 excluded
  });

  it('buy side: accumulates volume within each band below the best bid', () => {
    // best bid = 100. Bands: ≥99.5, ≥99, ≥98, ≥95, ≥90.
    const orders = [
      { price: 100, volume: BigInt(10) },
      { price: 99.6, volume: BigInt(5) },
      { price: 98.5, volume: BigInt(20) },
      { price: 96, volume: BigInt(30) },
      { price: 80, volume: BigInt(999) }, // outside 10% (≥90)
    ];
    const d = computeDepth(orders, 'desc', 100)!;
    expect(bandPct(d, 0.5)).toBe(15);
    expect(bandPct(d, 2)).toBe(35);
    expect(bandPct(d, 5)).toBe(65);
    expect(bandPct(d, 10)).toBe(65);
  });

  // Manipulation resistance — the reason depth anchors to best, not pct5.
  it('is robust to a tiny 0.01-ISK top-of-book spoof (buy side)', () => {
    // Real book: 500 @ 99.99 (best legit bid) + 500 @ 99.95.
    const real = [
      { price: 99.99, volume: BigInt(500) },
      { price: 99.95, volume: BigInt(500) },
    ];
    const honest = computeDepth(real, 'desc', 99.99)!;

    // Attacker places 1 unit at 100.00 to grab top-of-book — now the "best".
    const spoofed = [{ price: 100, volume: BigInt(1) }, ...real];
    const attacked = computeDepth(spoofed, 'desc', 100)!;

    // The 0.5% band off 100 is ≥99.5, which still contains the full real book;
    // the 1-unit spoof adds only 1 to the count. Depth is essentially unchanged.
    expect(bandPct(attacked, 0.5)).toBe(1001); // 1 + 500 + 500
    expect(bandPct(honest, 0.5)).toBe(1000);
    // The real liquidity is NOT hidden by the spoof (the failure mode pct5 has).
    expect(bandPct(attacked, 0.5)).toBeGreaterThan(900);
  });

  it('anchored to the dust-filtered best, the ladder captures the real book a sliver anchor excluded', () => {
    // The Market Score cascade fix (3.7.25.1): bucketToRawPrice feeds
    // computeDepth the best from computeSide, so the anchor is the hardened
    // one. A 1-unit sliver ~10% under a 8,000-unit real book used to anchor
    // the bands around ITSELF — every band excluded the real sell wall and
    // the stored ladder collapsed to the sliver's own volume ([1,1,1,1,1]).
    const orders = [
      { price: 90, volume: BigInt(1) },
      { price: 100, volume: BigInt(3_000) },
      { price: 100.4, volume: BigInt(5_000) },
    ];
    // The old anchor (the raw touch = the sliver): the real book sits >10%
    // above it, so every band counts only the sliver.
    const sliverAnchored = computeDepth(orders, 'asc', 90)!;
    expect(bandPct(sliverAnchored, 10)).toBe(1);

    // The hardened anchor (what bucketToRawPrice now passes): the real front.
    const hardenedBest = computeSide(orders, 'asc').best;
    expect(hardenedBest).toBe(100);
    const hardened = computeDepth(orders, 'asc', hardenedBest)!;
    // Both real orders sit within 0.5% of 100, and the sliver — cheaper than
    // every band ceiling — still counts its 1 unit: the full 8,001 sellable
    // units are visible instead of 1.
    expect(bandPct(hardened, 0.5)).toBe(8_001);
    expect(bandPct(hardened, 10)).toBe(8_001);
  });

  it('under-states (never over-states) depth under a far-out whale order', () => {
    // Real near-touch book around 100.
    const real = [
      { price: 100, volume: BigInt(500) },
      { price: 99.5, volume: BigInt(500) },
    ];
    // Attacker posts a huge bid far ABOVE the market (implausible escrow, but
    // the adversarial case): if it becomes "best", bands window around the fake
    // and EXCLUDE the real near-touch volume → depth reads shallower, not deeper.
    const whale = [{ price: 200, volume: BigInt(10_000_000) }, ...real];
    const d = computeDepth(whale, 'desc', 200)!;
    // 10% band off 200 is ≥180 → only the whale qualifies; real book excluded.
    expect(bandPct(d, 10)).toBe(10_000_000);
    // The real 1000 units near 100 are NOT counted as near-touch depth — the
    // safe (conservative) direction for a "can I dump this?" read.
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
    // Budget exhaustion is the one degradation cause not visible from the row
    // sources alone — the route handlers thread it into the O-1 telemetry.
    expect(budgetExhausted).toBe(true);
    expect(vi.mocked(fetchPricesFromFuzzwork)).toHaveBeenCalledOnce();
    // All five typeIds present in the one Fuzzwork call (order may vary).
    const calledWith = vi.mocked(fetchPricesFromFuzzwork).mock.calls[0]![0];
    expect([...calledWith].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('routes a malformed ESI body to Fuzzwork fallback (per-type path)', async () => {
    // 200 OK but the body isn't a valid orders array — a shape change or an
    // unexpected payload. The boundary schema rejects it and the affected
    // type routes to Fuzzwork, exactly like a transient ESI failure.
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

    const { prices: result, budgetExhausted } = await fetchPricesFromSource(bulkTypeIds());

    expect(result).toHaveLength(BULK_THRESHOLD + 20);
    expect(result.every((r) => r.source === 'esi')).toBe(true);
    expect(budgetExhausted).toBe(false);

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
    const { prices: result, budgetExhausted } = await fetchPricesFromSource(ids);

    expect(result).toHaveLength(ids.length);
    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    // A 5xx is an ESI failure, not budget exhaustion.
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
    const { prices: result } = await fetchPricesFromSource(ids);

    expect(result.every((r) => r.source === 'fuzzwork-fallback')).toBe(true);
    // Hard upper bound: cursor advancement plus in-flight workers when
    // the cancel flag flips. PAGE_CONCURRENCY = 8, so post-throw dispatch
    // is capped at 8 extra items. Pre-fix this assertion would see ~100.
    expect(calls).toBeLessThanOrEqual(20);
  });

  it('falls back to Fuzzwork when ESI bulk returns a malformed 200 body', async () => {
    // A non-array 200 body on the bulk path: the boundary schema throws
    // EsiContractError, which the dispatcher catches and routes to Fuzzwork
    // for the whole set — same as a 5xx.
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
    // The pre-Zod skim drops untracked orders before validation, so a
    // malformed order for a type we don't track no longer aborts the whole
    // bulk attempt — only tracked types stay contract-checked. Page 1 is the
    // full shape probe; the garbage rides page 2.
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const page = Number(/page=(\d+)/.exec(url)?.[1] ?? '1');
      if (page === 1) {
        return ordersResponse(
          [{ type_id: 1000, is_buy_order: true, price: 50, volume_remain: 10 }],
          '2',
        );
      }
      // Page 2: a valid tracked order plus a malformed untracked one (price is
      // a string — it would trip Zod if the skim ever let it reach the parser).
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

    // Bulk succeeded (no Fuzzwork fallback) and both tracked types aggregated;
    // the malformed untracked type produced no row.
    expect(result.every((r) => r.source === 'esi')).toBe(true);
    expect(result.find((r) => r.typeId === 1000)!.bestBuy).toBe(50);
    expect(result.find((r) => r.typeId === 1001)!.bestSell).toBe(200);
    expect(result.find((r) => r.typeId === 9999)).toBeUndefined();
    expect(vi.mocked(fetchPricesFromFuzzwork)).not.toHaveBeenCalled();
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
    // The RLML class end-to-end: a real hub book at 255k and a 19-unit remote
    // front at 28k. Pre-3.7.26.1 the stored best was 28k (region-scoped);
    // now the headline is the hub and the remote front becomes the callout.
    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 255_000, volume_remain: 5_000 },
        { type_id: 42, is_buy_order: true, price: 20_000, volume_remain: 100 },
        {
          type_id: 42, is_buy_order: false, price: 28_000, volume_remain: 19,
          location_id: NIYABAINEN_STATION, system_id: NIYABAINEN_SYSTEM,
        },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    const row = prices[0]!;
    expect(row.bestSell).toBe(255_000);
    expect(row.sellVolume).toBe(BigInt(5_000)); // hub volume only
    expect(row.bestBuy).toBe(20_000);
    expect(row.regionalDiscount).toEqual({
      systemId: NIYABAINEN_SYSTEM,
      price: 28_000,
      units: 19,
      pct: expect.closeTo(89.02, 1),
    });
  });

  it('drops remote BUY orders entirely — the ruled hub-station-only scope', async () => {
    // A region-reaching remote bid above the hub bid must not become
    // best_buy, dilute pct5_buy, or count toward buy volume.
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
    // A hub-only book: the row must look exactly like a pre-callout row
    // (regionalDiscount null), so no-opportunity products render unchanged.
    vi.mocked(esiFetch).mockResolvedValue(
      ordersResponse([
        { type_id: 42, is_buy_order: false, price: 1_000, volume_remain: 500 },
      ]),
    );

    const { prices } = await fetchPricesFromSource([42]);
    expect(prices[0]!.regionalDiscount).toBeNull();
  });

  it('an item with only remote sell orders goes null-priced with no discount', async () => {
    // The ruled consequence (sheet §3): no hub book → no hub price, and with
    // nothing to measure a discount against, no callout either.
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
