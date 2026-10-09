import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { DeltaBadge } from './DeltaBadge';
import type { MetricRow } from './metric-view';

export function KpiGrid({ rows }: { rows: MetricRow[] }) {
  return (
    <MultiplesGrid columns={4}>
      {rows.map((row) => (
        <MultiplesCell
          key={row.label}
          title={row.label}
          value={row.value}
          note={row.note}
          delta={row.delta ? <DeltaBadge delta={row.delta} /> : undefined}
        />
      ))}
    </MultiplesGrid>
  );
}
