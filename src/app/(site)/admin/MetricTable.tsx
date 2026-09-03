import { StaticSparkline } from '@/components/ui/chart/static-sparkline';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { metricLabelColumn } from './metric-label-column';
import { DeltaBadge } from './DeltaBadge';
import type { MetricRow } from './metric-view';

export function MetricTable({ rows, hint }: { rows: MetricRow[]; hint?: string }) {
  const columns = [
    metricLabelColumn<MetricRow>(),
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
