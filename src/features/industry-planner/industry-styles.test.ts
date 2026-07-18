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

// Fixed clock so freshness is deterministic.
const NOW = 1_700_000_000_000;
const FRESH = NOW + 60_000;
const STALE = NOW - 60_000;

// A fully-trustworthy row: fresh ESI price with real depth.
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

  it('is medium when stale', () => {
    const c = priceConfidence(liveRow({ staleAfterMs: STALE }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Stale — price may have moved');
  });

  it('is medium at the exact stale-after boundary', () => {
    const c = priceConfidence(liveRow({ staleAfterMs: NOW }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Stale — price may have moved');
  });

  it('is medium when the source is the fallback, not ESI', () => {
    const c = priceConfidence(liveRow({ source: 'fuzzwork-fallback' }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Fallback price source');
  });

  it('is medium when buy-side depth is thin', () => {
    const c = priceConfidence(liveRow({ buyVolume: 10 }), NOW);
    expect(c.level).toBe('medium');
    expect(c.reasons).toContain('Thin market depth');
  });

  it('accumulates every shortfall into reasons', () => {
    const c = priceConfidence(
      liveRow({ staleAfterMs: STALE, source: 'fuzzwork-fallback', buyVolume: 1 }),
      NOW,
    );
    expect(c.level).toBe('medium');
    expect(c.reasons).toHaveLength(3);
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
    // 8 of 10 fully trustworthy (≥75%) → headline stays high, exceptions listed.
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

// The browse catalog tallies the same shortfall counts in SQL and maps them
// here, so this must agree with aggregateConfidence's share bands + summary.
describe('aggregateConfidenceFromCounts', () => {
  it('is unknown with zero rows', () => {
    expect(aggregateConfidenceFromCounts({ high: 0, total: 0, stale: 0, fallback: 0, thin: 0, missing: 0 })).toEqual({
      level: 'unknown',
      summary: 'No materials to price',
    });
  });

  it('is high and clean when every row is trustworthy', () => {
    expect(aggregateConfidenceFromCounts({ high: 5, total: 5, stale: 0, fallback: 0, thin: 0, missing: 0 })).toEqual({
      level: 'high',
      summary: 'all live · liquid',
    });
  });

  it('stays high at the 75% band and lists each shortfall', () => {
    expect(
      aggregateConfidenceFromCounts({ high: 8, total: 10, stale: 1, fallback: 0, thin: 0, missing: 1 }),
    ).toEqual({ level: 'high', summary: '1 stale · 1 missing' });
  });

  it('is medium between the 40% and 75% bands', () => {
    expect(aggregateConfidenceFromCounts({ high: 5, total: 10, stale: 2, fallback: 1, thin: 2, missing: 0 })).toEqual({
      level: 'medium',
      summary: '2 stale · 1 fallback · 2 illiquid',
    });
  });

  it('drops to low below the 40% band', () => {
    expect(aggregateConfidenceFromCounts({ high: 1, total: 5, stale: 0, fallback: 0, thin: 0, missing: 4 })).toEqual({
      level: 'low',
      summary: '4 missing',
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
  const summary = { margin: 100, marginPct: 0.1 };

  it('uses gross from the summary when there is no net estimate', () => {
    expect(deriveMarginFigures(summary, null)).toEqual({
      showNet: false,
      margin: 100,
      marginPct: 0.1,
      sign: '+',
      missingSystemCostIndex: false,
      missingAdjustedPriceCount: 0,
    });
  });

  it('prefers net (and surfaces the missing-fee flags) when a net estimate exists', () => {
    const net = {
      netMargin: -50,
      netMarginPct: -0.05,
      jobFee: { missingSystemCostIndex: true, missingAdjustedPriceTypeIds: [1, 2] },
    };
    expect(deriveMarginFigures(summary, net)).toEqual({
      showNet: true,
      margin: -50,
      marginPct: -0.05,
      sign: '',
      missingSystemCostIndex: true,
      missingAdjustedPriceCount: 2,
    });
  });

  it('handles an absent summary without a net estimate', () => {
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
  it('flags a best sell well under the 5%-percentile (ratio < 0.90)', () => {
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: 100 })).toEqual({
      level: 'medium',
      reasons: ['Price anchored by a thin order'],
    });
  });

  it('stays silent at and above the threshold', () => {
    expect(sellAnchorConfidence({ bestSell: 90, pct5Sell: 100 })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 100, pct5Sell: 100 })).toBeNull();
    // A best above pct5 (tiny/degenerate book) is not a thin-anchor signal.
    expect(sellAnchorConfidence({ bestSell: 110, pct5Sell: 100 })).toBeNull();
  });

  it('is null-safe on missing or degenerate figures', () => {
    expect(sellAnchorConfidence({ bestSell: null, pct5Sell: 100 })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: null })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: 0 })).toBeNull();
    // A payload cached before the field existed carries undefined, not null —
    // it must read as "no reference", never as a firing NaN ratio.
    expect(sellAnchorConfidence({ bestSell: 89, pct5Sell: undefined })).toBeNull();
    expect(sellAnchorConfidence({ bestSell: undefined, pct5Sell: 100 })).toBeNull();
  });

  it('fires on the ratio alone — a Fuzzwork-fallback-shaped row is judged the same way', () => {
    // The fallback path stores the raw book bottom (no order book to filter),
    // so a thin-anchored fallback row wears the badge purely by its figures —
    // no source check involved.
    expect(sellAnchorConfidence({ bestSell: 21_200_000, pct5Sell: 230_000_000 })).toEqual({
      level: 'medium',
      reasons: ['Price anchored by a thin order'],
    });
  });
});

describe('regionalDiscountCallout', () => {
  it('shapes a stored discount for display (rounded pct, ids intact)', () => {
    expect(
      regionalDiscountCallout({
        regionalDiscount: { systemId: 30000143, price: 28_000, pct: 89.0196, units: 19 },
      }),
    ).toEqual({ systemId: 30000143, pct: 89, units: 19 });
  });

  it('is silent with no stored discount', () => {
    expect(regionalDiscountCallout({ regionalDiscount: null })).toBeNull();
  });

  it('is silent on a payload cached before the field existed (undefined, the #203 posture)', () => {
    expect(regionalDiscountCallout({})).toBeNull();
    expect(regionalDiscountCallout({ regionalDiscount: undefined })).toBeNull();
  });

  it('is silent on a malformed or degenerate object rather than rendering NaN', () => {
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
