'use client';

import dynamic from 'next/dynamic';
import { Measured } from '@/components/ui/measured';
import { formatIsk } from '@/lib/format/isk';
import { balanceChart } from './board-view-model';

const TrendChart = dynamic(() => import('@/components/ui/trend-chart').then((m) => m.TrendChart), {
  ssr: false,
});

/** An ISK balance over time, fitted to its own range, sized to its column. */
export function BalanceTrend({
  series,
  ariaLabel,
  height = 150,
}: {
  series: readonly { t: number; balance: number }[];
  ariaLabel: string;
  height?: number;
}) {
  const chart = balanceChart(series);
  if (chart.points.length < 2) return null;
  return (
    <Measured>
      {(width) => (
        <TrendChart
          data={chart.points}
          labels={chart.labels}
          yDomain={chart.domain}
          tone="green"
          width={width}
          height={height}
          formatY={formatIsk}
          formatTick={(label) => label.replace(/ \d{4}$/, '')}
          ariaLabel={ariaLabel}
        />
      )}
    </Measured>
  );
}
