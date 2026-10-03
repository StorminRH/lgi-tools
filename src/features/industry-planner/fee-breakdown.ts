import type { NetMarginView } from './types';

export interface FeeLine {
  label: string;
  value: number | null;
  /** Inputs this fee counts as nothing, having no CCP adjusted price. */
  unpriced?: string[];
}

export interface FeeBreakdown {
  /** The product's own job, charge by charge. */
  install: FeeLine[];
  finalJobTotal: number | null;
  /** The product's own inputs that have no CCP adjusted price. */
  finalJobUnpriced: string[];
  /** The jobs that make the inputs, dearest first; null where none is charged. */
  components: { jobs: FeeLine[]; total: number | null; partial: boolean } | null;
  sell: FeeLine[];
  sellTotal: number | null;
}

function systemCostLabel(systemCostIndex: number | null): string {
  if (systemCostIndex === null) return 'System cost';
  return `System cost (${(systemCostIndex * 100).toFixed(2)}%)`;
}

function facilityTaxLabel(rate: number, assumed: boolean): string {
  return `Facility tax (${(rate * 100).toFixed(2)}%${assumed ? ' assumed' : ''})`;
}

/** Unpriced last, so the dearest jobs lead. */
const byFee = (a: FeeLine, b: FeeLine) => (b.value ?? -Infinity) - (a.value ?? -Infinity);

function componentLines(net: NetMarginView, nameOf: (typeId: number) => string): FeeBreakdown['components'] {
  const jobs = net.componentJobs?.jobs ?? [];
  if (jobs.length === 0) return null;
  const lines = jobs
    .map((job): FeeLine => {
      const unpriced = job.fee.missingAdjustedPriceTypeIds.map(nameOf);
      return { label: nameOf(job.typeId), value: job.fee.total, ...(unpriced.length > 0 ? { unpriced } : {}) };
    })
    .sort(byFee);
  return { jobs: lines, total: net.componentJobs!.total, partial: lines.some((line) => line.unpriced) };
}

/** Some install fee counts an input as nothing for want of its CCP price. */
export function hasUnpricedInputs(net: NetMarginView): boolean {
  return (
    net.jobFee.missingAdjustedPriceTypeIds.length > 0 ||
    (net.componentJobs?.jobs.some((job) => job.fee.missingAdjustedPriceTypeIds.length > 0) ?? false)
  );
}

export function buildFeeBreakdown(net: NetMarginView, nameOf: (typeId: number) => string): FeeBreakdown {
  const { jobFee, sellSide, systemCostIndex } = net;

  const install: FeeLine[] = [
    { label: systemCostLabel(systemCostIndex), value: jobFee.jobGrossCost },
    { label: facilityTaxLabel(net.facilityTaxRate, net.facilityTaxAssumed), value: jobFee.facilityTax },
    { label: 'SCC surcharge', value: jobFee.sccSurcharge },
  ];
  const sell: FeeLine[] = [
    { label: 'Sales tax', value: sellSide.salesTax },
    { label: 'Broker fee', value: sellSide.brokerFee },
  ];

  const components = componentLines(net, nameOf);
  return {
    install,
    finalJobTotal: jobFee.total,
    finalJobUnpriced: jobFee.missingAdjustedPriceTypeIds.map(nameOf),
    components,
    sell,
    sellTotal: sellSide.total,
  };
}
