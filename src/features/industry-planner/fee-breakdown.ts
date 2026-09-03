import type { NetMarginView } from './types';

export interface FeeLine {
  label: string;
  value: number | null;
}

export interface FeeBreakdown {
  install: FeeLine[];
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

  return { install, installTotal: jobFee.total, sell, sellTotal: sellSide.total };
}
