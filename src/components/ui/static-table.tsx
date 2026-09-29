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

/** What a row may add: a click target, its own class, and whether its detail is showing. */
export interface StaticTableRowProps {
  onClick?: () => void;
  className?: string;
  expanded?: boolean;
}

export function StaticTable<Row>({
  columns,
  rows,
  getRowKey,
  ariaLabel,
  className,
  theadClassName,
  rowProps,
  renderDetail,
}: {
  columns: readonly StaticTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row, index: number) => Key;
  ariaLabel: string;
  className?: string;
  theadClassName?: string;
  rowProps?: (row: Row) => StaticTableRowProps;
  /** A full-width row under a row, for its expanded detail; null shows none. */
  renderDetail?: (row: Row) => ReactNode;
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
        {rows.flatMap((row, index) => {
          const key = getRowKey(row, index);
          const extra = rowProps?.(row);
          const detail = renderDetail?.(row) ?? null;
          const cells = (
            <tr
              key={key}
              onClick={extra?.onClick}
              aria-expanded={extra?.expanded}
              className={cn('border-b border-border-soft last:border-b-0', extra?.onClick && 'cursor-pointer', extra?.className)}
            >
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
          );
          if (detail === null) return [cells];
          return [
            cells,
            <tr key={`${String(key)}:detail`} className="border-b border-border-soft last:border-b-0">
              <td colSpan={columns.length}>{detail}</td>
            </tr>,
          ];
        })}
      </tbody>
    </table>
  );
}
