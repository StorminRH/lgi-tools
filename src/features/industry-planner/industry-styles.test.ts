import { describe, expect, it } from 'vitest';
import {
  aggregateConfidence,
  aggregateConfidenceFromCounts,
  deriveMarginFigures,
  priceConfidence,
  regionalDiscountCallout,
  sellAnchorConfidence,
  type ConfidenceInput,
} from './industry-styles';

const NOW = 1_700_000_000_000;
const FRESH = NOW + 60_000;
const STALE = NOW - 60_000;

function liveRow(over: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return { source: 'esi', buyVolume: 5_000, unitBuy: 10, staleAfterMs: FRESH, ...over };
}

describe('priceConfidence', () => {
  it('is high for a fresh ESI price with real depth', () => {
    const c = priceConfidence(liveRow(), NOW);
    expect(c.level).toBe('high');
    expect(c.reasons).toEqual([]);
  });

  it('is unknown when there is no price row at all', () => {
    expect(priceConfidence(liveRow({ staleAfterMs: null }), NOW).level).toBe('unknown');
  });

  it('is low when priced row has no usable buy price', () => {
    const c = priceConfidence(liveRow({ unitBuy: null }), NOW);
    expect(c.level).toBe('low');
    expect(c.reasons[0]).toMatch(/no live price/i);
  });

  it('is medium for stale (incl. boundary), fallback, thin depth, and stacked shortfalls', () => {
    for (const staleAfterMs of [STALE, NOW]) {
      const c = priceConfidence(liveRow({ staleAfterMs }), NOW);
      expect(c.level).toBe('medium');
      expect(c.reasons).toContain('Stale — price may have moved');
    }
    expect(priceConfidence(liveRow({ source: 'fuzzwork-fallback' }), NOW).reasons).toContain(
      'Fallback price source',
    );
    expect(priceConfidence(liveRow({ buyVolume: 10 }), NOW).reasons).toContain('Thin market depth');
    expect(
      priceConfidence(
        liveRow({ staleAfterMs: STALE, source: 'fuzzwork-fallback', buyVolume: 1 }),
        NOW,
      ).reasons,
    ).toHaveLength(3);
  });
});

describe('aggregateConfidence', () => {
  it('is unknown with no rows', () => {
    expect(aggregateConfidence([], NOW)).toEqual({
      level: 'unknown',
      summary: 'No materials to price',
    });
  });

  it('is high and clean when every row is trustworthy', () => {
    const rows = Array.from({ length: 5 }, () => liveRow());
    expect(aggregateConfidence(rows, NOW)).toEqual({
      level: 'high',
      summary: 'all live · liquid',
    });
  });

  it('stays high with a small share of problems, surfacing the counts', () => {

    const rows = [
      ...Array.from({ length: 8 }, () => liveRow()),
      liveRow({ staleAfterMs: STALE }),
      liveRow({ unitBuy: null }),
    ];
    expect(aggregateConfidence(rows, NOW)).toEqual({
      level: 'high',
      summary: '1 stale · 1 missing',
    });
  });

  it('counts a row at the exact stale-after boundary as stale', () => {
    expect(aggregateConfidence([liveRow({ staleAfterMs: NOW })], NOW)).toEqual({
      level: 'low',
      summary: '1 stale',
    });
  });

  it('drops to low when most rows are missing', () => {
    const rows = [
      liveRow(),
      liveRow({ staleAfterMs: null }),
      liveRow({ staleAfterMs: null }),
      liveRow({ unitBuy: null }),
      liveRow({ unitBuy: null }),
    ];
    const agg = aggregateConfidence(rows, NOW);
    expect(agg.level).toBe('low');
    expect(agg.summary).toBe('4 missing');
  });
});

describe('aggregateConfidenceFromCounts', () => {
  it('is medium between the 40% and 75% bands', () => {
    expect(aggregateConfidenceFromCounts({ high: 5, total: 10, stale: 2, fallback: 1, thin: 2, missing: 0 })).toEqual({
      level: 'medium',
      summary: '2 stale · 1 fallback · 2 illiquid',
    });
  });

  it('matches aggregateConfidence for the same population', () => {
    const rows: ConfidenceInput[] = [
      ...Array.from({ length: 8 }, () => liveRow()),
      liveRow({ staleAfterMs: STALE }),
      liveRow({ unitBuy: null }),
    ];
    const viaRows = aggregateConfidence(rows, NOW);
    const viaCounts = aggregateConfidenceFromCounts({
      high: 8,
      total: 10,
      stale: 1,
      fallback: 0,
      thin: 0,
      missing: 1,
    });
    expect(viaCounts).toEqual(viaRows);
  });
});

describe('deriveMarginFigures', () => {
  it('prefers net when present, falls back to gross, and handles absent summary', () => {
    const summary = { margin: 100, marginPct: 0.1 };
    expect(deriveMarginFigures(summary, null)).toEqual({
      showNet: false,
      margin: 100,
      marginPct: 0.1,
      sign: '+',
      missingSystemCostIndex: false,
      missingAdjustedPriceCount: 0,
    });
    expect(
      deriveMarginFigures(summary, {
        netMargin: -50,
        netMarginPct: -0.05,
        jobFee: { missingSystemCostIndex: true, missingAdjustedPriceTypeIds: [1, 2] },
      }),
    ).toEqual({
      showNet: true,
      margin: -50,
      marginPct: -0.05,
      sign: '',
      missingSystemCostIndex: true,
      missingAdjustedPriceCount: 2,
    });
    expect(deriveMarginFigures(null, null)).toEqual({
      showNet: false,
      margin: null,
      marginPct: null,
      sign: '',
      missingSystemCostIndex: false,
      missingAdjustedPriceCount: 0,
    });
  });
});

describe('sellAnchorConfidence', () => {
  it('flags thin anchors by ratio alone and stays silent otherwise', () => {
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: 100 })).toEqual({
      level: 'medium',
      reasons: ['Price anchored by a thin order'],
    });

    expect(sellAnchorConfidence({ bestSell: 21_200_000, pct5Sell: 230_000_000 })).toEqual({
      level: 'medium',
      reasons: ['Price anchored by a thin order'],
    });
    expect(sellAnchorConfidence({ bestSell: 90, pct5Sell: 100 })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 100, pct5Sell: 100 })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 110, pct5Sell: 100 })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: null, pct5Sell: 100 })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: null })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: 0 })).toBeNull();

    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: undefined })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: undefined, pct5Sell: 100 })).toBeNull();
  });
});

describe('regionalDiscountCallout', () => {
  it('shapes a stored discount and stays silent on absent or degenerate payloads', () => {
    expect(
      regionalDiscountCallout({
        regionalDiscount: { systemId: 30000143, price: 28_000, pct: 89.0196, units: 19 },
      }),
    ).toEqual({ systemId: 30000143, pct: 89, units: 19 });
    expect(regionalDiscountCallout({ regionalDiscount: null })).toBeNull();
    expect(regionalDiscountCallout({})).toBeNull();
    expect(regionalDiscountCallout({ regionalDiscount: undefined })).toBeNull();
    expect(
      regionalDiscountCallout({ regionalDiscount: { systemId: 30000143, pct: undefined, units: 19 } }),
    ).toBeNull();
    expect(
      regionalDiscountCallout({ regionalDiscount: { systemId: 30000143, pct: NaN, units: 19 } }),
    ).toBeNull();
    expect(
      regionalDiscountCallout({ regionalDiscount: { systemId: 30000143, pct: 50, units: 0 } }),
    ).toBeNull();
  });
});
