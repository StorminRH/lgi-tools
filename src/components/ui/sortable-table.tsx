import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from './cn';
import { deriveSortHeaderCells, type SortHeaderCellModel } from './sortable-table-view';

export interface SortableColumn<Row> {
  key: string;
  label: string;
  // Sortable by default. Set false for purely-rendered columns (none today,
  // but the slot exists so future consumers don't get forced into a string
  // comparator they don't want).
  sortable?: boolean;
  // 'right' is the convention for numeric columns; the primitive uses this
  // to right-align both the header label and the cell content.
  align?: 'left' | 'right';
  render: (row: Row) => ReactNode;
}

interface RenderRowArg<Row> {
  row: Row;
  cells: ReactNode;
  key: string | number;
  // The Tailwind `grid-cols-[…]` class the consumer applies to whatever element
  // holds the cells, so its row lines up with the header.
  gridColsClass: string;
}

interface Props<Row> {
  columns: SortableColumn<Row>[];
  rows: Row[];
  // Tailwind `grid-cols-[…]` class shared by the header and every row so their
  // columns line up; must match the column count/order. Never an inline style —
  // house style keeps the column template in a class, not on the element.
  gridColsClass: string;
  // sortKey === null means "default order" (no ?sort param in the URL).
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  // URL building — matches the FilterBar contract so the same params pattern
  // works for the existing Type/Class bars and the new sort headers.
  basePath: string;
  currentParams: Record<string, string | undefined>;
  // URL param names — defaults to 'sort' + 'dir'. Customisable so a future
  // page with two tables can give each its own pair.
  sortParam?: string;
  dirParam?: string;
  // The default direction for a column when the user first activates it.
  // The consumer owns the policy because it knows whether a column is
  // numeric (desc-first) or string (asc-first). Falls back to 'desc' if not
  // provided.
  defaultDirFor?: (columnKey: string) => 'asc' | 'desc';
  getRowKey: (row: Row) => string | number;
  // Optional wrapper for each row — receives the pre-rendered cells. When
  // omitted, rows render as a plain non-interactive grid div. Consumers who
  // want clickable / expandable rows wrap the cells in <Link>, <details>,
  // <UrlSync>, etc.
  renderRow?: (arg: RenderRowArg<Row>) => ReactNode;
  emptyState?: ReactNode;
}

// Header cell — a sort link, or a plain label for a non-sortable column. The
// active/href/indicator decisions live in `deriveSortHeaderCells`; this only
// renders the model.
function SortHeaderCell({ cell }: { cell: SortHeaderCellModel }) {
  if (cell.href === null) {
    return (
      <span
        className={cn(
          'font-jb text-label uppercase tracking-[0.12em] text-muted inline-flex items-center gap-1',
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
        'font-jb text-label uppercase tracking-[0.12em] inline-flex items-center gap-1 transition-colors',
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
            'font-mono text-ui text-text min-w-0',
            col.align === 'right' ? 'text-right' : 'text-left',
          )}
        >
          {col.render(row)}
        </div>
      ))}
    </>
  );

  return (
    // Horizontal scroll on narrow viewports: the grid columns keep a min-width
    // floor (so labels/values don't crush) and the wrapper scrolls them sideways
    // instead of stacking. Vertical content (an expanded row) still grows the
    // page — the wrapper has no height cap, so overflow-y never clips. Lives in
    // the primitive, so every table inherits it.
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
