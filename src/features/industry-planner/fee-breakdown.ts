import type { NetMarginView } from './types';

// Itemized install + sell fees for the Net-margin tile's hover — the breakdown
// the retired Raw-ledger view used to show, restored read-only from the values
// the net path already computes (industry-math's fees). Pure: the net view in,
// labelled line items out; the component formats and lays them out. No fee math
// here — it only re-presents amounts that already exist.

export interface FeeLine {
  label: string;
  // ISK amount, or null when it can't be computed — a missing system cost index
  // leaves the system-cost line (and the install subtotal) unknown.
  value: number | null;
}

export interface FeeBreakdown {
  install: FeeLine[];
  installTotal: number | null;
  sell: FeeLine[];
  sellTotal: number | null;
}

// The system cost index is the one rate that varies per build system, so it's
// surfaced in the label; the fixed taxes stay plain (their amounts carry the
// substance, and hard-coding their rates here would drift from industry-math).
function systemCostLabel(systemCostIndex: number | null): string {
  if (systemCostIndex === null) return 'System cost';
  return `System cost (${(systemCostIndex * 100).toFixed(2)}%)`;
}

export function buildFeeBreakdown(net: NetMarginView): FeeBreakdown {
  const { jobFee, sellSide, systemCostIndex } = net;

  const install: FeeLine[] = [
    { label: systemCostLabel(systemCostIndex), value: jobFee.jobGrossCost },
    { label: 'Facility tax', value: jobFee.facilityTax },
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
