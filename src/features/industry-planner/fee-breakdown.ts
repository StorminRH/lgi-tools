import type { NetMarginView } from './types';

export interface FeeLine {
  label: string;
  value: number | null;
}

export interface FeeBreakdown {
  /** The product's own job, charge by charge. */
  install: FeeLine[];
  finalJobTotal: number | null;
  /** The jobs that make the inputs, dearest first; null where none is charged. */
  components: { jobs: FeeLine[]; total: number | null } | null;
  /** Every job's install fee. */
  installTotal: number | null;
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

const plus = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/** Unpriced last, so the dearest jobs lead. */
const byFee = (a: FeeLine, b: FeeLine) => (b.value ?? -Infinity) - (a.value ?? -Infinity);

function componentLines(net: NetMarginView, nameOf: (typeId: number) => string): FeeBreakdown['components'] {
  const jobs = net.componentJobs?.jobs ?? [];
  if (jobs.length === 0) return null;
  return {
    jobs: jobs.map((job) => ({ label: nameOf(job.typeId), value: job.fee.total })).sort(byFee),
    total: net.componentJobs!.total,
  };
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
    components,
    installTotal: components ? plus(jobFee.total, components.total) : jobFee.total,
    sell,
    sellTotal: sellSide.total,
  };
}
