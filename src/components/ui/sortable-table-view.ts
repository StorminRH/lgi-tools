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

  href: string | null;

  indicator: string | null;
  isActive: boolean;
};

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
