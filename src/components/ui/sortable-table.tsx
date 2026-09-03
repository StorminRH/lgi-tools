import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from './cn';
import { deriveSortHeaderCells, type SortHeaderCellModel } from './sortable-table-view';
import { eyebrow } from './type-roles';

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
      <span
        className={cn(
          eyebrow({ className: 'inline-flex items-center gap-1 font-data' }),
          cell.alignClass,
        )}
      >
        {cell.label}
      </span>

    );
  }

  return (
    <Link
      href={cell.href}
      scroll={false}
      className={cn(
        eyebrow({
          tone: 'inherit',
          className: 'inline-flex items-center gap-1 font-data transition-colors',
        }),
        cell.alignClass,
        cell.isActive ? 'text-name' : 'text-muted hover:text-text',
      )}
    >
      <span>{cell.label}</span>

      {cell.indicator && <span className="text-isk">{cell.indicator}</span>}

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
        'sortable-table-header grid items-center gap-4 px-3 py-2 border-b border-border',
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
            'font-data text-ui text-text min-w-0',
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
      <div className="sortable-table border border-border bg-section min-w-[640px]">
        {renderHeader()}
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-muted text-ui">{emptyState ?? 'No rows.'}</div>

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
                  'sortable-table-row grid items-center gap-4 px-3 py-2 border-b border-border-soft last:border-b-0',
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
