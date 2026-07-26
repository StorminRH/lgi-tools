import type { Key, ReactNode } from 'react';
import { cn } from './cn';

/** One declarative column in a semantic, non-sortable static table. */
export interface StaticTableColumn<Row> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
  headerClassName?: string;
  className?: string;
  render: (row: Row) => ReactNode;
}

function cellClass(
  align: 'left' | 'right' = 'left',
  className?: string,
): string {
  return cn(
    'px-3.5 py-2 font-mono text-ui',
    align === 'right' ? 'text-right' : 'text-left',
    className,
  );
}

function headerClass(
  align: 'left' | 'right' = 'left',
  className?: string,
): string {
  return cn(
    'px-3.5 py-2 font-mono text-label tracking-display uppercase text-muted',
    align === 'right' ? 'text-right' : 'text-left',
    className,
  );
}

/**
 * Renders tabular data with one shared semantic header and cell vocabulary.
 */
export function StaticTable<Row>({
  columns,
  rows,
  getRowKey,
  ariaLabel,
  className,
}: {
  columns: readonly StaticTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row, index: number) => Key;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <table aria-label={ariaLabel} className={cn('w-full border-collapse font-mono text-ui', className)}>
      <thead>
        <tr className="border-b border-border-soft">
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={headerClass(column.align, column.headerClassName)}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={getRowKey(row, index)} className="border-b border-border-soft last:border-b-0">
            {columns.map((column) => (
              <td
                key={column.key}
                className={cellClass(column.align, column.className)}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
