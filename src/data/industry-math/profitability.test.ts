import { describe, expect, it } from 'vitest';
import {
  computeBuildCost,
  computeMargin,
  type MaterialPrice,
  type MaterialQty,
  type PriceOf,
} from './profitability';

// Known-good flattened material totals, copied verbatim from the 3.0.4 tree
// resolver spike (scripts/spike-known-good.json — also the permanent eve-data
// fixture). Inlined rather than imported so industry-math imports nothing from
// another data slice (a cross-slice `data → data` import fails the boundaries
// lint, and test files are linted too). Rifter + Drake are firm anchors (direct
// CSV equality, no intermediate components). Archon is a regression sentinel
// only — its totals are self-referential, not externally validated, so a future
// Archon mismatch is not automatically a planner bug.
const RIFTER_MATERIALS: Record<number, number> = {
  34: 32000,
  35: 6000,
  36: 2500,
  37: 500,
};

const DRAKE_MATERIALS: Record<number, number> = {
  34: 2800000,
  35: 1000000,
  36: 180000,
  37: 20000,
  38: 8000,
  39: 2000,
  40: 400,
};

const ARCHON_MATERIALS: Record<number, number> = {
  34: 4215500, 35: 12445600, 36: 3468300, 37: 965700, 38: 100502, 39: 48611,
  40: 24723, 44: 7832, 2312: 536, 2319: 661, 2329: 125, 2346: 300, 2348: 300,
  2361: 100, 2401: 3500, 2463: 661, 2867: 41, 2868: 30, 2870: 50, 2871: 9,
  2872: 33, 2876: 6, 3645: 3500, 3683: 43076, 3689: 7832, 3775: 536, 9832: 17622,
  9842: 75, 9848: 1958, 11399: 1500, 16272: 332860, 16273: 685300, 16274: 126900,
  16275: 39160, 16633: 1192800, 16634: 1192800, 16635: 56800, 16636: 56800,
  16637: 400, 16643: 400, 16644: 400, 16646: 600, 16647: 200, 16650: 200,
  16651: 200, 16652: 600, 16653: 200, 17887: 456750, 17888: 83700, 17889: 213750,
  25276: 320, 25277: 320, 28694: 160, 28695: 160, 28696: 160, 28697: 160,
  28698: 2720, 28699: 2720, 28700: 160, 28701: 160, 30370: 13500, 30371: 13700,
  30372: 14100, 30373: 13100, 30374: 13500, 30375: 13700, 30376: 1600, 30377: 600,
  30378: 600, 57443: 1, 57445: 100, 57446: 4, 57447: 4, 57448: 4, 57450: 1,
  57452: 75,
};

function toMaterials(map: Record<number, number>): MaterialQty[] {
  return Object.entries(map).map(([typeId, quantity]) => ({
    typeId: Number(typeId),
    quantity,
  }));
}

// A buy-only price map for the firm anchors. Round numbers so the expected
// totals below are hand-verifiable.
const ANCHOR_BUY: Record<number, number> = {
  34: 5, 35: 10, 36: 100, 37: 200, 38: 1000, 39: 2000, 40: 5000, 44: 10000,
};

function priceOfFrom(buy: Record<number, number>): PriceOf {
  return (typeId): MaterialPrice | undefined =>
    typeId in buy ? { bestBuy: buy[typeId]!, bestSell: null } : undefined;
}

describe('computeBuildCost', () => {
  it('sums quantity × best buy for the Rifter (firm anchor)', () => {
    const cost = computeBuildCost(toMaterials(RIFTER_MATERIALS), priceOfFrom(ANCHOR_BUY));
    // 32000·5 + 6000·10 + 2500·100 + 500·200 = 160000 + 60000 + 250000 + 100000
    expect(cost.total).toBe(570_000);
    expect(cost.missingTypeIds).toEqual([]);
    expect(cost.perMaterial).toHaveLength(4);
    const trit = cost.perMaterial.find((m) => m.typeId === 34);
    expect(trit).toMatchObject({ quantity: 32000, unitBuy: 5, extendedCost: 160_000 });
  });

  it('sums quantity × best buy for the Drake (firm anchor)', () => {
    const cost = computeBuildCost(toMaterials(DRAKE_MATERIALS), priceOfFrom(ANCHOR_BUY));
    // 14M + 10M + 18M + 4M + 8M + 4M + 2M
    expect(cost.total).toBe(60_000_000);
    expect(cost.missingTypeIds).toEqual([]);
  });

  it('flags materials with no row or a null buy price instead of undercounting', () => {
    // Drop type 37 entirely; give type 36 a present-but-null buy side.
    const priceOf: PriceOf = (typeId) => {
      if (typeId === 37) return undefined;
      if (typeId === 36) return { bestBuy: null, bestSell: 999 };
      return { bestBuy: ANCHOR_BUY[typeId] ?? null, bestSell: null };
    };
    const cost = computeBuildCost(toMaterials(RIFTER_MATERIALS), priceOf);
    // Only 34 and 35 priced: 160000 + 60000.
    expect(cost.total).toBe(220_000);
    expect(cost.missingTypeIds.sort((a, b) => a - b)).toEqual([36, 37]);
    const isk = cost.perMaterial.find((m) => m.typeId === 36);
    expect(isk).toMatchObject({ unitBuy: null, extendedCost: null });
  });

  it('handles the Archon material set without throwing (regression sentinel)', () => {
    // Flat 10 ISK per unit across all 76 materials → total = 10 × Σ quantity.
    const flatBuy: PriceOf = () => ({ bestBuy: 10, bestSell: null });
    const cost = computeBuildCost(toMaterials(ARCHON_MATERIALS), flatBuy);
    const totalUnits = Object.values(ARCHON_MATERIALS).reduce((a, b) => a + b, 0);
    expect(cost.perMaterial).toHaveLength(Object.keys(ARCHON_MATERIALS).length);
    expect(cost.missingTypeIds).toEqual([]);
    expect(cost.total).toBe(10 * totalUnits);
  });
});

describe('computeMargin', () => {
  it('computes revenue, margin, and margin % before fees', () => {
    const m = computeMargin({ buildCost: 570_000, productSell: 700_000, productQty: 1 });
    expect(m.revenue).toBe(700_000);
    expect(m.cost).toBe(570_000);
    expect(m.margin).toBe(130_000);
    expect(m.marginPct).toBeCloseTo((130_000 / 700_000) * 100, 6);
  });

  it('scales revenue by the product output quantity per run', () => {
    const m = computeMargin({ buildCost: 100, productSell: 50, productQty: 10 });
    expect(m.revenue).toBe(500);
    expect(m.margin).toBe(400);
  });

  it('reports a loss as a negative margin', () => {
    const m = computeMargin({ buildCost: 1_000_000, productSell: 600_000, productQty: 1 });
    expect(m.margin).toBe(-400_000);
    expect(m.marginPct).toBeCloseTo((-400_000 / 600_000) * 100, 6);
  });

  it('returns null revenue/margin when the product has no sell price', () => {
    const m = computeMargin({ buildCost: 570_000, productSell: null, productQty: 1 });
    expect(m.revenue).toBeNull();
    expect(m.margin).toBeNull();
    expect(m.marginPct).toBeNull();
    expect(m.cost).toBe(570_000);
  });
});
