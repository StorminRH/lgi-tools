import { describe, expect, it } from 'vitest';
import {
  computeJobInstallationFee,
  computeNetMargin,
  computeSellSideFees,
  DEFAULT_FEE_RATES,
  effectiveFacilityTaxRate,
  MAX_FACILITY_TAX_PCT,
  REACTION_SCC_SURCHARGE,
  type AdjustedPriceOf,
} from './fees';
import type { MaterialQty } from './profitability';

// Rifter direct ME0 base materials (Tritanium/Pyerite/Mexallon/Isogen). The
// Rifter builds directly from minerals with no intermediate components, so its
// direct base materials equal its flat materials — the same firm anchor used in
// profitability.test.ts.
const RIFTER_BASE: Record<number, number> = {
  34: 32000,
  35: 6000,
  36: 2500,
  37: 500,
};

function toMaterials(map: Record<number, number>): MaterialQty[] {
  return Object.entries(map).map(([typeId, quantity]) => ({
    typeId: Number(typeId),
    quantity,
  }));
}

function adjustedFrom(prices: Record<number, number>): AdjustedPriceOf {
  return (typeId) => (typeId in prices ? prices[typeId] : null);
}

// Round adjusted prices, deliberately a DIFFERENT series from the build-cost buy
// prices below — CCP's adjusted_price is its own daily series, not market
// buy/sell. Chosen so EIV is hand-verifiable.
const RIFTER_ADJUSTED: Record<number, number> = { 34: 6, 35: 11, 36: 120, 37: 250 };

describe('DEFAULT_FEE_RATES (verified 2026-06 — fail on silent rate drift)', () => {
  it('pins the current EVE rates', () => {
    expect(DEFAULT_FEE_RATES).toEqual({
      facilityTax: 0.0025, // 0.25% NPC station (Viridian 2023-06)
      sccSurcharge: 0.04, // 4% manufacturing (Version 21.06, 2024-02)
      salesTax: 0.075, // 7.5% base, no Accounting (Version 22.02, 2025-03-12)
      brokerFee: 0.03, // 3% NPC base, no Broker Relations/standings
    });
  });

  it('pins the reaction SCC (shares the 4% manufacturing rate; the 2025-07 rework cut research only)', () => {
    expect(REACTION_SCC_SURCHARGE).toBe(0.04);
  });

  it('pins the player-structure facility-tax cap (0–10%, Viridian 2023-06)', () => {
    expect(MAX_FACILITY_TAX_PCT).toBe(10);
  });
});

describe('effectiveFacilityTaxRate', () => {
  it('falls back to the NPC baseline when no tax was entered (the byte-identity guard)', () => {
    expect(effectiveFacilityTaxRate(null)).toBe(DEFAULT_FEE_RATES.facilityTax);
  });

  it('converts an entered percent to a fraction', () => {
    expect(effectiveFacilityTaxRate(1.5)).toBe(0.015);
    expect(effectiveFacilityTaxRate(10)).toBe(0.1);
    expect(effectiveFacilityTaxRate(0.35)).toBeCloseTo(0.0035, 12);
  });

  it('treats an entered 0 as a real 0% rate, not "unset"', () => {
    expect(effectiveFacilityTaxRate(0)).toBe(0);
  });
});

describe('computeJobInstallationFee', () => {
  it('computes EIV and the itemized fee lines for the Rifter (worked example)', () => {
    const fee = computeJobInstallationFee(
      toMaterials(RIFTER_BASE),
      adjustedFrom(RIFTER_ADJUSTED),
      0.05,
    );
    // EIV = 32000·6 + 6000·11 + 2500·120 + 500·250 = 192000 + 66000 + 300000 + 125000
    expect(fee.estimatedItemValue).toBe(683_000);
    expect(fee.jobGrossCost).toBe(34_150); // 683000 × 0.05
    expect(fee.facilityTax).toBeCloseTo(1707.5, 6); // 683000 × 0.0025
    expect(fee.sccSurcharge).toBe(27_320); // 683000 × 0.04
    expect(fee.total).toBeCloseTo(63_177.5, 6); // 34150 + 1707.5 + 27320
    expect(fee.missingAdjustedPriceTypeIds).toEqual([]);
    expect(fee.missingSystemCostIndex).toBe(false);
  });

  it('flags a missing adjusted price with a partial EIV instead of undercounting silently', () => {
    // Drop type 37 entirely (no adjusted price).
    const adjusted: AdjustedPriceOf = (typeId) =>
      typeId === 37 ? null : (RIFTER_ADJUSTED[typeId] ?? null);
    const fee = computeJobInstallationFee(toMaterials(RIFTER_BASE), adjusted, 0.05);
    // EIV without 37: 192000 + 66000 + 300000 = 558000.
    expect(fee.estimatedItemValue).toBe(558_000);
    expect(fee.missingAdjustedPriceTypeIds).toEqual([37]);
    // The fee total is still computed on the partial EIV; the caller marks it incomplete.
    expect(fee.total).toBeCloseTo(558_000 * (0.05 + 0.0025 + 0.04), 6);
  });

  it('treats an adjusted price of 0 as a known price, not as missing', () => {
    // Type 34 has a real adjusted price of 0 (distinct from absent).
    const adjusted = adjustedFrom({ ...RIFTER_ADJUSTED, 34: 0 });
    const fee = computeJobInstallationFee(toMaterials(RIFTER_BASE), adjusted, 0.05);
    expect(fee.missingAdjustedPriceTypeIds).toEqual([]);
    // EIV drops the 34 contribution (32000·0 = 0): 66000 + 300000 + 125000 = 491000.
    expect(fee.estimatedItemValue).toBe(491_000);
  });

  it('nulls jobGrossCost and total when the system cost index is missing, but still shows the EIV-only lines', () => {
    const fee = computeJobInstallationFee(
      toMaterials(RIFTER_BASE),
      adjustedFrom(RIFTER_ADJUSTED),
      null,
    );
    expect(fee.estimatedItemValue).toBe(683_000);
    expect(fee.jobGrossCost).toBeNull();
    expect(fee.total).toBeNull();
    expect(fee.missingSystemCostIndex).toBe(true);
    // facilityTax and sccSurcharge depend on EIV alone — still known.
    expect(fee.facilityTax).toBeCloseTo(1707.5, 6);
    expect(fee.sccSurcharge).toBe(27_320);
  });

  it('treats a system cost index of 0 as valid (jobGrossCost 0, not missing)', () => {
    const fee = computeJobInstallationFee(toMaterials(RIFTER_BASE), adjustedFrom(RIFTER_ADJUSTED), 0);
    expect(fee.missingSystemCostIndex).toBe(false);
    expect(fee.jobGrossCost).toBe(0);
    expect(fee.total).toBeCloseTo(1707.5 + 27_320, 6); // facility + scc only
  });

  it('returns a zero, complete fee for empty base materials', () => {
    const fee = computeJobInstallationFee([], adjustedFrom(RIFTER_ADJUSTED), 0.05);
    expect(fee.estimatedItemValue).toBe(0);
    expect(fee.jobGrossCost).toBe(0);
    expect(fee.facilityTax).toBe(0);
    expect(fee.sccSurcharge).toBe(0);
    expect(fee.total).toBe(0);
    expect(fee.missingAdjustedPriceTypeIds).toEqual([]);
    expect(fee.missingSystemCostIndex).toBe(false);
  });

  it('applies a structure job-cost bonus to jobGrossCost ONLY — not facility tax or SCC (3.7.9.1.3)', () => {
    const fee = computeJobInstallationFee(
      toMaterials(RIFTER_BASE),
      adjustedFrom(RIFTER_ADJUSTED),
      0.05,
      DEFAULT_FEE_RATES,
      4, // a 4% structure cost reduction (an Azbel role bonus)
    );
    expect(fee.estimatedItemValue).toBe(683_000);
    // jobGrossCost = 683000 × 0.05 × (1 − 0.04) = 34150 × 0.96 = 32784
    expect(fee.jobGrossCost).toBeCloseTo(32_784, 6);
    // facility tax + SCC are EIV-only — the structure bonus must NOT touch them
    expect(fee.facilityTax).toBeCloseTo(1707.5, 6);
    expect(fee.sccSurcharge).toBe(27_320);
    expect(fee.total).toBeCloseTo(32_784 + 1707.5 + 27_320, 6);
  });

  it('job fee is byte-identical when the structure cost bonus is 0', () => {
    const withZero = computeJobInstallationFee(
      toMaterials(RIFTER_BASE),
      adjustedFrom(RIFTER_ADJUSTED),
      0.05,
      DEFAULT_FEE_RATES,
      0,
    );
    const without = computeJobInstallationFee(
      toMaterials(RIFTER_BASE),
      adjustedFrom(RIFTER_ADJUSTED),
      0.05,
    );
    expect(withZero).toEqual(without);
  });
});

describe('computeSellSideFees', () => {
  it('computes sales tax and broker fee on the sell revenue', () => {
    const fees = computeSellSideFees(700_000);
    expect(fees.salesTax).toBe(52_500); // 700000 × 0.075
    expect(fees.brokerFee).toBe(21_000); // 700000 × 0.03
    expect(fees.total).toBe(73_500);
  });

  it('returns null fields (never zero) when revenue is unknown', () => {
    const fees = computeSellSideFees(null);
    expect(fees.salesTax).toBeNull();
    expect(fees.brokerFee).toBeNull();
    expect(fees.total).toBeNull();
  });

  it('returns zero fees for a zero revenue (a known 0, distinct from null)', () => {
    const fees = computeSellSideFees(0);
    expect(fees.salesTax).toBe(0);
    expect(fees.brokerFee).toBe(0);
    expect(fees.total).toBe(0);
  });
});

describe('computeNetMargin', () => {
  // The Rifter worked example end to end. NOTE: buildCost (570000, a Jita-buy
  // basis identical to profitability.test.ts's ANCHOR_BUY) and the EIV
  // (683000, a CCP adjusted-price basis) are intentionally DIFFERENT price
  // series for the same Rifter — the negative net margin is an artifact of that
  // gap, not a claim that Rifters are unprofitable.
  it('subtracts the job fee and sell-side fees from gross margin (worked example)', () => {
    const net = computeNetMargin({
      buildCost: 570_000,
      productSell: 700_000,
      productQty: 1,
      baseMaterials: toMaterials(RIFTER_BASE),
      adjustedPriceOf: adjustedFrom(RIFTER_ADJUSTED),
      systemCostIndex: 0.05,
    });

    expect(net.revenue).toBe(700_000);
    expect(net.buildCost).toBe(570_000);
    expect(net.grossMargin).toBe(130_000); // 700000 − 570000

    expect(net.jobFee.estimatedItemValue).toBe(683_000);
    expect(net.jobFee.total).toBeCloseTo(63_177.5, 6);
    expect(net.sellSide.total).toBe(73_500);

    expect(net.netCost).toBeCloseTo(633_177.5, 6); // 570000 + 63177.5
    expect(net.netMargin).toBeCloseTo(-6677.5, 6); // 700000 − 73500 − 633177.5
    expect(net.netMarginPct).toBeCloseTo((-6677.5 / 700_000) * 100, 6); // ≈ −0.9539286
    expect(net.incomplete).toBe(false);
  });

  it('keeps gross margin but nulls the net path when the system cost index is missing', () => {
    const net = computeNetMargin({
      buildCost: 570_000,
      productSell: 700_000,
      productQty: 1,
      baseMaterials: toMaterials(RIFTER_BASE),
      adjustedPriceOf: adjustedFrom(RIFTER_ADJUSTED),
      systemCostIndex: null,
    });
    expect(net.grossMargin).toBe(130_000); // still known
    expect(net.jobFee.missingSystemCostIndex).toBe(true);
    expect(net.netCost).toBeNull();
    expect(net.netMargin).toBeNull();
    expect(net.netMarginPct).toBeNull();
    expect(net.incomplete).toBe(true);
  });

  it('nulls revenue, sell-side, and net margin when the product has no sell price', () => {
    const net = computeNetMargin({
      buildCost: 570_000,
      productSell: null,
      productQty: 1,
      baseMaterials: toMaterials(RIFTER_BASE),
      adjustedPriceOf: adjustedFrom(RIFTER_ADJUSTED),
      systemCostIndex: 0.05,
    });
    expect(net.revenue).toBeNull();
    expect(net.grossMargin).toBeNull();
    expect(net.sellSide.total).toBeNull();
    expect(net.netMargin).toBeNull();
    expect(net.netMarginPct).toBeNull();
    expect(net.incomplete).toBe(true);
    // The build-side fee is still computed (it doesn't depend on revenue).
    expect(net.jobFee.total).toBeCloseTo(63_177.5, 6);
  });

  it('nulls netMarginPct (no divide-by-zero) when the product sell price is 0', () => {
    const net = computeNetMargin({
      buildCost: 570_000,
      productSell: 0,
      productQty: 1,
      baseMaterials: toMaterials(RIFTER_BASE),
      adjustedPriceOf: adjustedFrom(RIFTER_ADJUSTED),
      systemCostIndex: 0.05,
    });
    expect(net.revenue).toBe(0);
    expect(net.sellSide.total).toBe(0);
    expect(net.netMarginPct).toBeNull();
    // netMargin is still a real number: 0 − 0 − (570000 + 63177.5).
    expect(net.netMargin).toBeCloseTo(-633_177.5, 6);
  });

  it('flags incomplete and lists the missing material when an adjusted price is absent', () => {
    const adjusted: AdjustedPriceOf = (typeId) =>
      typeId === 37 ? null : (RIFTER_ADJUSTED[typeId] ?? null);
    const net = computeNetMargin({
      buildCost: 570_000,
      productSell: 700_000,
      productQty: 1,
      baseMaterials: toMaterials(RIFTER_BASE),
      adjustedPriceOf: adjusted,
      systemCostIndex: 0.05,
    });
    expect(net.jobFee.missingAdjustedPriceTypeIds).toEqual([37]);
    expect(net.incomplete).toBe(true);
    // Net margin is still computed on the partial EIV (a lower-bound fee).
    expect(net.netMargin).not.toBeNull();
  });
});
