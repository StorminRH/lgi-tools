import { type StaticTableColumn } from '@/components/ui/static-table';

/** First column for a label-keyed admin metric table. */
export function metricLabelColumn<Row extends { label: string }>(): StaticTableColumn<Row> {
  return {
    key: 'metric',
    label: 'Metric',
    rowHeader: true,
    render: (row) => row.label,
    className: 'text-text',
  };
}
