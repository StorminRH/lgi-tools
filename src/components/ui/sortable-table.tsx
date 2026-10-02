import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from './cn';
import { deriveSortHeaderCells, type SortHeaderCellModel } from './sortable-table-view';

/** Floating row: each row is its own rounded glass strip with no rules between. */
export const floatingRow =
  'rounded-card bg-bg-deep/60 transition-colors duration-fast hover:bg-bg-deep/35';

const headerText = 'inline-flex items-center gap-1 font-ui text-ui font-medium';

export interface SortableColumn<Row> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  render: (row: Row) => ReactNode;
}

export interface RenderRowArg<Row> {
  row: Row;
  cells: ReactNode;
  key: string | number;
  gridColsClass: string;
}

export interface Props<Row> {
  columns: SortableColumn<Row>[];
  rows: Row[];
  gridColsClass: string;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  basePath: string;
  currentParams: Record<string, string | undefined>;
  sortParam?: string;
  dirParam?: string;
  defaultDirFor?: (columnKey: string) => 'asc' | 'desc';
  getRowKey: (row: Row) => string | number;
  renderRow?: (arg: RenderRowArg<Row>) => ReactNode;
  emptyState?: ReactNode;
}

function SortHeaderCell({ cell }: { cell: SortHeaderCellModel }) {
  if (cell.href === null) {
    return (
      <span className={cn(headerText, 'text-muted', cell.alignClass)}>
        {cell.label}
      </span>
    );
  }

  return (
    <Link
      href={cell.href}
      scroll={false}
      className={cn(
        headerText,
        'transition-colors',
        cell.alignClass,
        cell.isActive ? 'text-name' : 'text-muted hover:text-text',
      )}
    >
      <span>{cell.label}</span>
      {cell.indicator && <span className="text-aurora">{cell.indicator}</span>}
    </Link>
  );
}

export function SortableTable<Row>({
  columns,
  rows,
  gridColsClass,
  sortKey,
  sortDir,
  basePath,
  currentParams,
  sortParam = 'sort',
  dirParam = 'dir',
  defaultDirFor,
  getRowKey,
  renderRow,
  emptyState,
}: Props<Row>) {
  const headerCells = deriveSortHeaderCells({
    columns,
    sortKey,
    sortDir,
    basePath,
    currentParams,
    sortParam,
    dirParam,
    defaultDirFor,
  });

  const renderHeader = () => (
    <div
      className={cn(
        'sortable-table-header grid items-center gap-4 px-3 pt-2 pb-0.5',
        gridColsClass,
      )}
    >
      {headerCells.map((cell) => (
        <SortHeaderCell key={cell.key} cell={cell} />
      ))}
    </div>
  );

  const renderCells = (row: Row) => (
    <>
      {columns.map((col) => (
        <div
          key={col.key}
          className={cn(
            'font-ui text-ui tabular-nums text-text min-w-0',
            col.align === 'right' ? 'text-right' : 'text-left',
          )}
        >
          {col.render(row)}
        </div>
      ))}
    </>
  );

  return (
    <div className="overflow-x-auto">
      <div className="sortable-table flex min-w-[640px] flex-col gap-1.5 p-1.5">
        {renderHeader()}
        {rows.length === 0 ? (
          <div className={cn(floatingRow, 'px-3 py-6 text-center text-muted text-ui')}>{emptyState ?? 'No rows.'}</div>
        ) : (
          rows.map((row) => {
            const key = getRowKey(row);
            const cells = renderCells(row);
            if (renderRow) {
              return <Fragment key={key}>{renderRow({ row, cells, key, gridColsClass })}</Fragment>;
            }
            return (
              <div
                key={key}
                className={cn(
                  'sortable-table-row grid items-center gap-4 px-3 py-2.5',
                  floatingRow,
                  gridColsClass,
                )}
              >
                {cells}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
