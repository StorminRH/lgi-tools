import { describe, expect, it } from 'vitest';
import { buildFeeBreakdown } from './fee-breakdown';
import type { NetMarginView } from './types';

// Spread over the base so an explicit `null` override survives (a `?? default`
// would silently collapse it back, which is the exact case under test).
function net(overrides: {
  systemCostIndex?: number | null;
  jobGrossCost?: number | null;
  total?: number | null;
  missingSystemCostIndex?: boolean;
  missingAdjustedPriceTypeIds?: number[];
  salesTax?: number | null;
  brokerFee?: number | null;
  sellTotal?: number | null;
  facilityTaxRate?: number;
  facilityTaxAssumed?: boolean;
}): NetMarginView {
  const o = {
    systemCostIndex: 0.0234,
    jobGrossCost: 234,
    total: 659,
    missingSystemCostIndex: false,
    missingAdjustedPriceTypeIds: [] as number[],
    salesTax: 750,
    brokerFee: 300,
    sellTotal: 1_050,
    facilityTaxRate: 0.0025,
    facilityTaxAssumed: true,
    ...overrides,
  };
  return {
    netMargin: 0,
    netMarginPct: 0,
    netCost: 0,
    systemCostIndex: o.systemCostIndex,
    facilityTaxRate: o.facilityTaxRate,
    facilityTaxAssumed: o.facilityTaxAssumed,
    jobFee: {
      estimatedItemValue: 10_000,
      jobGrossCost: o.jobGrossCost,
      facilityTax: 25,
      sccSurcharge: 400,
      total: o.total,
      missingSystemCostIndex: o.missingSystemCostIndex,
      missingAdjustedPriceTypeIds: o.missingAdjustedPriceTypeIds,
    },
    sellSide: {
      salesTax: o.salesTax,
      brokerFee: o.brokerFee,
      total: o.sellTotal,
    },
  };
}

describe('buildFeeBreakdown', () => {
  it('itemizes install + sell fees with the per-system index in the label', () => {
    const b = buildFeeBreakdown(net({}));
    expect(b.install).toEqual([
      { label: 'System cost (2.34%)', value: 234 },
      { label: 'Facility tax (0.25% assumed)', value: 25 },
      { label: 'SCC surcharge', value: 400 },
    ]);
    expect(b.installTotal).toBe(659);
    expect(b.sell).toEqual([
      { label: 'Sales tax', value: 750 },
      { label: 'Broker fee', value: 300 },
    ]);
    expect(b.sellTotal).toBe(1_050);
  });

  it('labels an entered facility tax with its rate and no assumed marker', () => {
    const b = buildFeeBreakdown(net({ facilityTaxRate: 0.015, facilityTaxAssumed: false }));
    expect(b.install[1]).toEqual({ label: 'Facility tax (1.50%)', value: 25 });
  });

  it('drops the index from the label and nulls the line when no cost index exists', () => {
    const b = buildFeeBreakdown(
      net({ systemCostIndex: null, jobGrossCost: null, total: null, missingSystemCostIndex: true }),
    );
    // The "—" rendered for these nulls is the only signal needed (no footnote).
    expect(b.install[0]).toEqual({ label: 'System cost', value: null });
    expect(b.installTotal).toBeNull();
  });
});
