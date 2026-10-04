import type { Key, ReactNode } from 'react';
import { cn } from './cn';

export interface StaticTableColumn<Row> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
  rowHeader?: boolean;
  headerClassName?: string;
  className?: string;
  render: (row: Row) => ReactNode;
}

const docTableClass = cn(
  'overflow-x-auto rounded-card border border-border font-ui text-ui',
  '[&_table]:w-full [&_table]:border-collapse',
  '[&_td]:border-t [&_td]:border-border-soft [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_td]:align-top',
  '[&_th]:border-t [&_th]:border-border-soft [&_th]:bg-bg-deep [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top',
  '[&_th]:text-label [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.1em] [&_th]:text-muted',
  '[&_tr:first-child>*]:border-t-0',
);

export function DocTable({ children }: { children: ReactNode }) {
  return (
    <div className={docTableClass}>
      <table>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function cellClass(
  align: 'left' | 'right' = 'left',
  className?: string,
): string {
  return cn(
    'bg-bg-deep/60 px-3.5 py-2.5 font-ui text-ui tabular-nums transition-colors duration-fast ' +
      'first:rounded-l-card last:rounded-r-card group-hover:bg-bg-deep/35',
    align === 'right' ? 'text-right' : 'text-left',
    className,
  );
}

function headerClass(
  align: 'left' | 'right' = 'left',
  className?: string,
): string {
  return cn(
    'px-3.5 pt-2 pb-0.5 font-ui text-ui font-medium text-muted',
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
    <table aria-label={ariaLabel} className={cn('w-full border-separate border-spacing-y-1.5 font-ui text-ui', className)}>
      <thead className={theadClassName}>
        <tr>
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
          <tr key={getRowKey(row, index)} className="group">
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
