import type { CatalogRow } from './browse-types';

// URL-state parsing + comparators for the browse catalog (column 0). Mirrors
// `wormhole-sites/sort.ts`: numeric columns descend on first click (biggest
// first — the point of a margin browse), the name column ascends. Null
// margin/cost rows sink to the bottom regardless of direction.

export const CATALOG_SORT_KEYS = ['margin', 'cost', 'name'] as const;
export type CatalogSortKey = (typeof CATALOG_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

// How many rows column 0 renders. The catalog spans ~5,500 blueprints; each
// visible row is a real icon request, so we cap to the top slice of the active
// sort and lean on the filters to narrow. The default margin-desc view is the
// "top blueprints by margin" entry surface.
export const CATALOG_CAP = 200;

export const MARGIN_BANDS = ['all', 'profitable'] as const;
export type MarginBand = (typeof MARGIN_BANDS)[number];

export function parseSortKey(raw: string | undefined): CatalogSortKey | null {
  if (!raw) return null;
  return (CATALOG_SORT_KEYS as readonly string[]).includes(raw)
    ? (raw as CatalogSortKey)
    : null;
}

export function parseSortDir(raw: string | undefined): SortDir {
  return raw === 'asc' ? 'asc' : 'desc';
}

export function parseMarginBand(raw: string | undefined): MarginBand {
  return raw === 'profitable' ? 'profitable' : 'all';
}

export function defaultDirFor(key: CatalogSortKey): SortDir {
  return key === 'name' ? 'asc' : 'desc';
}

function valueFor(row: CatalogRow, key: CatalogSortKey): string | number | null {
  switch (key) {
    case 'name': return row.name;
    case 'cost': return row.inputCost;
    case 'margin': return row.margin;
  }
}

// Default order when no ?sort is set: margin desc (the entry surface). A null
// margin (unpriced product) always sorts last.
export function sortCatalog(
  rows: CatalogRow[],
  sortKey: CatalogSortKey | null,
  sortDir: SortDir,
): CatalogRow[] {
  const key: CatalogSortKey = sortKey ?? 'margin';
  const mult = (sortKey === null ? 'desc' : sortDir) === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = valueFor(a, key);
    const bv = valueFor(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * mult;
    }
    return ((av as number) - (bv as number)) * mult;
  });
}

export function filterByMarginBand(rows: CatalogRow[], band: MarginBand): CatalogRow[] {
  if (band !== 'profitable') return rows;
  return rows.filter((r) => r.margin !== null && r.margin > 0);
}
