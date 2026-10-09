import { describe, expect, it } from 'vitest';
import {
  deriveMarginFigures,
  regionalDiscountCallout,
  sellAnchorConfidence,
} from './industry-styles';

describe('deriveMarginFigures', () => {
  it('includes component index failures and deduplicates missing adjusted inputs across jobs', () => {
    const figures = deriveMarginFigures(null, {
      netMargin: null,
      netMarginPct: null,
      jobFee: { missingSystemCostIndex: false, missingAdjustedPriceTypeIds: [1] },
      componentJobs: { jobs: [
        { fee: { missingSystemCostIndex: true, missingAdjustedPriceTypeIds: [1, 2] } },
        { fee: { missingSystemCostIndex: false, missingAdjustedPriceTypeIds: [2] } },
      ] },
    });
    expect(figures.missingSystemCostIndex).toBe(true);
    expect(figures.missingAdjustedPriceCount).toBe(2);
    expect(figures.showNet).toBe(true);
    expect(figures.margin).toBeNull();
  });
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
