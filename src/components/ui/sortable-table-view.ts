// Pure view model for the sortable-table header — the sort-direction toggle,
// href building, and active/indicator decisions — so the primitive's header
// row renders branch-free. Kept in a plain module (no React import) so it
// unit-tests cleanly and imports only what it needs (a minimal column shape,
// not the component's `SortableColumn<Row>`, which avoids an import cycle).

/** The header-relevant slice of a column (a `SortableColumn<Row>` satisfies this). */
export type SortHeaderColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right';
};

export type SortHeaderCellModel = {
  key: string;
  label: string;
  alignClass: string;
  sortable: boolean;
  /** Sort link target, or null for a non-sortable column. */
  href: string | null;
  /** Active-column direction glyph, or null. */
  indicator: string | null;
  isActive: boolean;
};

/** Rebuild the query string with a new sort column + direction, dropping any prior sort params. */
export function buildSortHref(
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

/**
 * The per-column header models: alignment, whether it's a sort link (and where
 * to), and the active-direction indicator. An already-active column toggles
 * direction; a fresh column takes its `defaultDirFor` (or 'desc').
 */
export function deriveSortHeaderCells(opts: {
  columns: SortHeaderColumn[];
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  basePath: string;
  currentParams: Record<string, string | undefined>;
  sortParam: string;
  dirParam: string;
  defaultDirFor?: (columnKey: string) => 'asc' | 'desc';
}): SortHeaderCellModel[] {
  const { columns, sortKey, sortDir, basePath, currentParams, sortParam, dirParam, defaultDirFor } =
    opts;
  return columns.map((col) => {
    const isActive = sortKey === col.key;
    const sortable = col.sortable !== false;
    const alignClass =
      col.align === 'right' ? 'justify-end text-right' : 'justify-start text-left';

    if (!sortable) {
      return { key: col.key, label: col.label, alignClass, sortable, href: null, indicator: null, isActive };
    }

    // Toggle direction if already-active; otherwise the column's default.
    const nextDir: 'asc' | 'desc' = isActive
      ? sortDir === 'asc'
        ? 'desc'
        : 'asc'
      : defaultDirFor?.(col.key) ?? 'desc';
    const href = buildSortHref(basePath, currentParams, sortParam, dirParam, col.key, nextDir);
    const indicator = isActive ? (sortDir === 'asc' ? '▲' : '▼') : null;
    return { key: col.key, label: col.label, alignClass, sortable, href, indicator, isActive };
  });
}
