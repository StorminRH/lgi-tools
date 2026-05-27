import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from './cn';

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
  // CSS grid track size, e.g. '1fr', '2fr', '120px'. Defaults to '1fr'.
  width?: string;
  render: (row: Row) => ReactNode;
}

interface RenderRowArg<Row> {
  row: Row;
  cells: ReactNode;
  key: string | number;
  // CSS grid-template-columns string the consumer should pass to whatever
  // element holds the cells, so the summary row lines up with the header.
  gridTemplate: string;
}

interface Props<Row> {
  columns: SortableColumn<Row>[];
  rows: Row[];
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

function buildSortHref(
  basePath: string,
  currentParams: Record<string, string | undefined>,
  sortParam: string,
  dirParam: string,
  newSort: string,
  newDir: 'asc' | 'desc',
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(currentParams)) {
    if (k === sortParam || k === dirParam) continue;
    if (v) params.set(k, v);
  }
  params.set(sortParam, newSort);
  params.set(dirParam, newDir);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function SortableTable<Row>({
  columns,
  rows,
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
  const gridTemplate = columns.map((c) => c.width ?? '1fr').join(' ');

  const renderHeader = () => (
    <div
      className="sortable-table-header grid items-center px-3 py-2 border-b border-border"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {columns.map((col) => {
        const isActive = sortKey === col.key;
        const sortable = col.sortable !== false;
        const alignClass = col.align === 'right' ? 'justify-end text-right' : 'justify-start text-left';

        if (!sortable) {
          return (
            <span
              key={col.key}
              className={cn(
                'font-jb text-[9px] uppercase tracking-[0.12em] text-muted inline-flex items-center gap-1',
                alignClass,
              )}
            >
              {col.label}
            </span>
          );
        }

        // Toggle direction if already-active column; otherwise pick the column's
        // default direction.
        const nextDir: 'asc' | 'desc' = isActive
          ? sortDir === 'asc' ? 'desc' : 'asc'
          : defaultDirFor?.(col.key) ?? 'desc';

        const href = buildSortHref(basePath, currentParams, sortParam, dirParam, col.key, nextDir);
        const indicator = isActive ? (sortDir === 'asc' ? '▲' : '▼') : null;

        return (
          <Link
            key={col.key}
            href={href}
            scroll={false}
            className={cn(
              'font-jb text-[9px] uppercase tracking-[0.12em] inline-flex items-center gap-1 transition-colors',
              alignClass,
              isActive ? 'text-name' : 'text-muted hover:text-text',
            )}
          >
            <span>{col.label}</span>
            {indicator && <span className="text-isk">{indicator}</span>}
          </Link>
        );
      })}
    </div>
  );

  const renderCells = (row: Row) => (
    <>
      {columns.map((col) => (
        <div
          key={col.key}
          className={cn(
            'font-mono text-[11px] text-text min-w-0',
            col.align === 'right' ? 'text-right' : 'text-left',
          )}
        >
          {col.render(row)}
        </div>
      ))}
    </>
  );

  return (
    <div className="sortable-table border border-border bg-section" style={{ ['--st-grid' as string]: gridTemplate }}>
      {renderHeader()}
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-muted text-[11px]">{emptyState ?? 'No rows.'}</div>
      ) : (
        rows.map((row) => {
          const key = getRowKey(row);
          const cells = renderCells(row);
          if (renderRow) {
            return <Fragment key={key}>{renderRow({ row, cells, key, gridTemplate })}</Fragment>;
          }
          return (
            <div
              key={key}
              className="sortable-table-row grid items-center px-3 py-2 border-b border-border-soft last:border-b-0"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {cells}
            </div>
          );
        })
      )}
    </div>
  );
}
