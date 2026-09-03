import type { Key, ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

export interface StaticTableColumn<Row> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
  rowHeader?: boolean;
  headerClassName?: string;
  className?: string;
  render: (row: Row) => ReactNode;
}

function cellClass(
  align: 'left' | 'right' = 'left',
  className?: string,
): string {
  return cn(
    'px-3.5 py-2 font-data text-ui',
    align === 'right' ? 'text-right' : 'text-left',
    className,
  );
}

function headerClass(
  align: 'left' | 'right' = 'left',
  className?: string,
): string {
  return cn(
    eyebrow({
      emphasis: 'strong',
      className: 'px-3.5 py-2 font-data',
    }),
    align === 'right' ? 'text-right' : 'text-left',
    className,
  );
}

export function StaticTable<Row>({
  columns,
  rows,
  getRowKey,
  ariaLabel,
  className,
  theadClassName,
}: {
  columns: readonly StaticTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row, index: number) => Key;
  ariaLabel: string;
  className?: string;
  theadClassName?: string;
}) {
  return (
    <table aria-label={ariaLabel} className={cn('w-full border-collapse font-data text-ui', className)}>
      <thead className={theadClassName}>
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
            {columns.map((column) => {
              const Cell = column.rowHeader ? 'th' : 'td';
              return (
                <Cell
                  key={column.key}
                  scope={column.rowHeader ? 'row' : undefined}
                  className={cellClass(
                    column.align,
                    cn(column.rowHeader && 'font-normal', column.className),
                  )}
                >
                  {column.render(row)}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
