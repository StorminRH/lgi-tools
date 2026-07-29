import { StaticSparkline } from '@/components/ui/chart/static-sparkline';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { DeltaBadge } from './DeltaBadge';
import type { MetricRow } from './metric-view';

// The headline metrics as a real <table> — one row per metric, every answer
// readable at rest: current value, per-day average, the period-over-period
// delta (colour + ▲/▼ symbol), and an inline sparkline where a daily series
// exists. Replaces the KpiCard grid. A11y floor: a genuine table with a header
// row; the delta's direction is carried by the symbol as well as the colour.

/**
 * Renders headline metrics as an accessible table, preserving each row's comparison direction and
 * optional range hint.
 */
export function MetricTable({ rows, hint }: { rows: MetricRow[]; hint?: string }) {
  const columns = [
    {
      key: 'metric',
      label: 'Metric',
      rowHeader: true,
      render: (row) => row.label,
      className: 'text-text',
    },
    { key: 'current', label: 'Current', align: 'right', render: (row) => row.value, className: 'text-name' },
    { key: 'average', label: 'Avg / day', align: 'right', render: (row) => row.avg ?? '—', className: 'text-muted' },
    {
      key: 'delta',
      label: 'Δ',
      align: 'right',
      render: (row) => row.delta ? <DeltaBadge delta={row.delta} /> : <span className="text-muted">—</span>,
    },
    {
      key: 'trend',
      label: 'Trend',
      align: 'right',
      headerClassName: 'hidden sm:table-cell',
      className: 'hidden sm:table-cell',
      render: (row) => row.series ? (
        <span className="inline-flex align-middle">
          <StaticSparkline values={row.series} ariaLabel={`${row.label} recent trend`} />
        </span>
      ) : <span className="text-muted">—</span>,
    },
  ] satisfies readonly StaticTableColumn<MetricRow>[];
  return (
    <Card>
      <SectionHeader size="md" label="Headline metrics" hint={hint} />
      <div className="overflow-x-auto">
        <StaticTable
          ariaLabel="Headline metrics"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.label}
        />
      </div>
    </Card>
  );
}
