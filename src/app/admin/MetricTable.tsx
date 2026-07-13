import { StaticSparkline } from '@/components/ui/chart/static-sparkline';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { DeltaBadge } from './DeltaBadge';
import type { MetricRow } from './metric-view';

// The headline metrics as a real <table> — one row per metric, every answer
// readable at rest: current value, per-day average, the period-over-period
// delta (colour + ▲/▼ symbol), and an inline sparkline where a daily series
// exists. Replaces the KpiCard grid. A11y floor: a genuine table with a header
// row; the delta's direction is carried by the symbol as well as the colour.

export function MetricTable({ rows, hint }: { rows: MetricRow[]; hint?: string }) {
  return (
    <Card>
      <SectionHeader size="md" label="Headline metrics" hint={hint} />
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-ui tabular-nums">
          <thead>
            <tr className="text-label tracking-display uppercase text-muted text-left">
              <th scope="col" className="px-3.5 py-2 font-medium">
                Metric
              </th>
              <th scope="col" className="px-3.5 py-2 font-medium text-right">
                Current
              </th>
              <th scope="col" className="px-3.5 py-2 font-medium text-right">
                Avg / day
              </th>
              <th scope="col" className="px-3.5 py-2 font-medium text-right">
                Δ
              </th>
              <th scope="col" className="px-3.5 py-2 font-medium text-right hidden sm:table-cell">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border-soft">
                <th scope="row" className="px-3.5 py-2.5 font-normal text-left text-text">
                  {row.label}
                </th>
                <td className="px-3.5 py-2.5 text-right text-name">{row.value}</td>
                <td className="px-3.5 py-2.5 text-right text-muted">{row.avg ?? '—'}</td>
                <td className="px-3.5 py-2.5 text-right">
                  {row.delta ? (
                    <DeltaBadge delta={row.delta} />
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3.5 py-2.5 text-right hidden sm:table-cell">
                  {row.series ? (
                    <span className="inline-flex align-middle">
                      <StaticSparkline values={row.series} ariaLabel={`${row.label} recent trend`} />
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
