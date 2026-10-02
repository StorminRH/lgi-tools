import { describe, expect, it } from 'vitest';
import { buildFeeBreakdown } from './fee-breakdown';
import type { ComponentJobFees, NetMarginView } from './types';

const NAMES: Record<number, string> = { 10: 'Capital Armor Plates', 20: 'Fernite Carbide', 30: 'Tungsten Carbide' };
const nameOf = (typeId: number) => NAMES[typeId] ?? `Type ${typeId}`;

const job = (typeId: number, total: number | null) => ({
  typeId,
  blueprintTypeId: typeId + 100,
  reaction: false,
  runs: 1,
  systemId: 1,
  systemCostIndex: total === null ? null : 0.01,
  facilityTaxRate: 0.0025,
  fee: {
    estimatedItemValue: 1_000,
    jobGrossCost: total,
    facilityTax: 2.5,
    sccSurcharge: 40,
    total,
    missingSystemCostIndex: total === null,
    missingAdjustedPriceTypeIds: [],
  },
});

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
  componentJobs?: ComponentJobFees | null;
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
    componentJobs: null,
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
    componentJobs: o.componentJobs,
  };
}

describe('buildFeeBreakdown', () => {
  it('itemizes install + sell fees with the per-system index in the label', () => {
    const b = buildFeeBreakdown(net({}), nameOf);
    expect(b.install).toEqual([
      { label: 'System cost (2.34%)', value: 234 },
      { label: 'Facility tax (0.25% assumed)', value: 25 },
      { label: 'SCC surcharge', value: 400 },
    ]);
    expect(b.finalJobTotal).toBe(659);
    expect(b.components).toBeNull();
    expect(b.sell).toEqual([
      { label: 'Sales tax', value: 750 },
      { label: 'Broker fee', value: 300 },
    ]);
    expect(b.sellTotal).toBe(1_050);
  });

  it('labels an entered facility tax with its rate and no assumed marker', () => {
    const b = buildFeeBreakdown(net({ facilityTaxRate: 0.015, facilityTaxAssumed: false }), nameOf);
    expect(b.install[1]).toEqual({ label: 'Facility tax (1.50%)', value: 25 });
  });

  it('drops the index from the label and nulls the line when no cost index exists', () => {
    const b = buildFeeBreakdown(
      net({ systemCostIndex: null, jobGrossCost: null, total: null, missingSystemCostIndex: true }),
      nameOf,
    );
    expect(b.install[0]).toEqual({ label: 'System cost', value: null });
    expect(b.finalJobTotal).toBeNull();
  });

  it('lists the jobs that make the inputs, dearest first, with their total', () => {
    const b = buildFeeBreakdown(
      net({ componentJobs: { jobs: [job(20, 40), job(10, 120.5), job(30, 7)], total: 167.5 } }),
      nameOf,
    );
    expect(b.components).toEqual({
      jobs: [
        { label: 'Capital Armor Plates', value: 120.5 },
        { label: 'Fernite Carbide', value: 40 },
        { label: 'Tungsten Carbide', value: 7 },
      ],
      total: 167.5,
    });
    expect(b.finalJobTotal).toBe(659);
  });

  it('a component job with no index sinks to the bottom and leaves their total open', () => {
    const b = buildFeeBreakdown(net({ componentJobs: { jobs: [job(30, null), job(10, 5)], total: null } }), nameOf);
    expect(b.components!.jobs.map((l) => l.label)).toEqual(['Capital Armor Plates', 'Tungsten Carbide']);
    expect(b.components!.total).toBeNull();
  });

  it('a build with nothing below the product lists no component jobs', () => {
    const b = buildFeeBreakdown(net({ componentJobs: { jobs: [], total: 0 } }), nameOf);
    expect(b.components).toBeNull();
  });
});
