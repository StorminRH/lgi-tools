import { computeDelta, type Delta } from '@/composition/admin-period';

export interface GscMetricCell {
  title: string;
  value: string;
  delta: Delta | null;
  invert: boolean;
  note?: string;
}

export function deriveGscMultiples(input: {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  prevTotals: { clicks: number; impressions: number; position: number } | null;
}): GscMetricCell[] {
  const { totals, prevTotals } = input;
  return [
    {
      title: 'Clicks',
      value: totals.clicks.toLocaleString(),
      delta: computeDelta(totals.clicks, prevTotals?.clicks ?? null),
      invert: false,
      note: `${(totals.ctr * 100).toFixed(1)}% CTR`,
    },
    {
      title: 'Impressions',
      value: totals.impressions.toLocaleString(),
      delta: computeDelta(totals.impressions, prevTotals?.impressions ?? null),
      invert: false,
    },
    {
      title: 'Avg position',
      value: totals.impressions > 0 ? totals.position.toFixed(1) : '—',
      delta: totals.impressions > 0 && prevTotals && prevTotals.impressions > 0
        ? computeDelta(totals.position, prevTotals.position)
        : null,
      invert: true,
    },
  ];
}
