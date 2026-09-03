import { computeDelta, type Delta } from '@/composition/admin-period';

export interface GscMetricCell {
  title: string;
  value: string;
  delta: Delta | null;
  invert: boolean;
  note?: string;
}

export function deriveGscMultiples(input: {
  totals: { clicks: number; impressions: number; position: number };
  prevTotals: { clicks: number; impressions: number; position: number } | null;
}): GscMetricCell[] {
  const { totals, prevTotals } = input;
  return [
    {
      title: 'Clicks',
      value: totals.clicks.toLocaleString(),
      delta: computeDelta(totals.clicks, prevTotals?.clicks ?? null),
      invert: false,
    },
    {
      title: 'Impressions',
      value: totals.impressions.toLocaleString(),
      delta: computeDelta(totals.impressions, prevTotals?.impressions ?? null),
      invert: false,
    },
    {
      title: 'Avg position',
      value: totals.position.toFixed(1),

      delta: computeDelta(totals.position, prevTotals?.position ?? null),
      invert: true,
      note: 'lower = better',
    },
  ];
}
