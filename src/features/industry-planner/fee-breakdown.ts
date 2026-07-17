import type { NetMarginView } from './types';

// Itemized install + sell fees for the Net-margin tile's hover — the breakdown
// the retired Raw-ledger view used to show, restored read-only from the values
// the net path already computes (industry-math's fees). Pure: the net view in,
// labelled line items out; the component formats and lays them out. No fee math
// here — it only re-presents amounts that already exist.

/** One labelled planner fee component with amount in ISK and optional explanatory rate. */
export interface FeeLine {
  label: string;
  // ISK amount, or null when it can't be computed — a missing system cost index
  // leaves the system-cost line (and the install subtotal) unknown.
  value: number | null;
}

/** Complete job-fee components and total in ISK for one planned build. */
export interface FeeBreakdown {
  install: FeeLine[];
  installTotal: number | null;
  sell: FeeLine[];
  sellTotal: number | null;
}

// The system cost index and the facility tax are the two rates that vary per
// build (per system / per structure), so both surface in their labels; the SCC
// stays plain (its amount carries the substance, and hard-coding its rate here
// would drift from industry-math). The rates come off the net view — never
// re-derived — so the labels can't drift from what was actually charged.
function systemCostLabel(systemCostIndex: number | null): string {
  if (systemCostIndex === null) return 'System cost';
  return `System cost (${(systemCostIndex * 100).toFixed(2)}%)`;
}

// "(0.25% assumed)" when no owner tax is entered on the fee-bearing structure —
// the NPC-baseline assumption made visible — vs the entered "(1.50%)". The flag
// is threaded, never inferred from the rate: an entered 0.25% is a real rate.
function facilityTaxLabel(rate: number, assumed: boolean): string {
  return `Facility tax (${(rate * 100).toFixed(2)}%${assumed ? ' assumed' : ''})`;
}

/** Calculates facility tax, system cost index, SCC surcharge, and total job fee in ISK for one build. */
export function buildFeeBreakdown(net: NetMarginView): FeeBreakdown {
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

  // No honesty footnotes: a missing system cost index / reference price already
  // shows as a "—" on its line, so the values speak for themselves.
  return { install, installTotal: jobFee.total, sell, sellTotal: sellSide.total };
}
