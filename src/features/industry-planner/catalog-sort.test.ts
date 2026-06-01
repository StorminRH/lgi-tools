import { describe, expect, it } from 'vitest';
import type { CatalogRow } from './browse-types';
import {
  defaultDirFor,
  filterByMarginBand,
  parseMarginBand,
  parseSortDir,
  parseSortKey,
  sortCatalog,
} from './catalog-sort';

function row(over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    blueprintTypeId: 1,
    productTypeId: 1,
    name: 'Item',
    categoryName: 'Ship',
    activityId: 1,
    inputCost: 100,
    revenue: 200,
    margin: 100,
    marginPct: 50,
    confidence: 'high',
    confidenceSummary: 'all live · liquid',
    ...over,
  };
}

describe('parsers', () => {
  it('parseSortKey accepts only known keys', () => {
    expect(parseSortKey('margin')).toBe('margin');
    expect(parseSortKey('cost')).toBe('cost');
    expect(parseSortKey('name')).toBe('name');
    expect(parseSortKey('bogus')).toBeNull();
    expect(parseSortKey(undefined)).toBeNull();
  });

  it('parseSortDir defaults to desc', () => {
    expect(parseSortDir('asc')).toBe('asc');
    expect(parseSortDir('desc')).toBe('desc');
    expect(parseSortDir(undefined)).toBe('desc');
    expect(parseSortDir('junk')).toBe('desc');
  });

  it('parseMarginBand defaults to all', () => {
    expect(parseMarginBand('profitable')).toBe('profitable');
    expect(parseMarginBand('all')).toBe('all');
    expect(parseMarginBand(undefined)).toBe('all');
  });

  it('numeric columns descend first, name ascends', () => {
    expect(defaultDirFor('margin')).toBe('desc');
    expect(defaultDirFor('cost')).toBe('desc');
    expect(defaultDirFor('name')).toBe('asc');
  });
});

describe('sortCatalog', () => {
  it('defaults to margin desc when no sort key is set', () => {
    const rows = [row({ margin: 10 }), row({ margin: 90 }), row({ margin: 50 })];
    expect(sortCatalog(rows, null, 'desc').map((r) => r.margin)).toEqual([90, 50, 10]);
  });

  it('pushes null margins to the end regardless of direction', () => {
    const rows = [row({ margin: null }), row({ margin: 10 }), row({ margin: 90 })];
    expect(sortCatalog(rows, 'margin', 'desc').map((r) => r.margin)).toEqual([90, 10, null]);
    expect(sortCatalog(rows, 'margin', 'asc').map((r) => r.margin)).toEqual([10, 90, null]);
  });

  it('sorts cost numerically and name alphabetically', () => {
    const rows = [row({ inputCost: 300 }), row({ inputCost: 100 }), row({ inputCost: 200 })];
    expect(sortCatalog(rows, 'cost', 'asc').map((r) => r.inputCost)).toEqual([100, 200, 300]);

    const named = [row({ name: 'Charon' }), row({ name: 'Avatar' }), row({ name: 'Buzzard' })];
    expect(sortCatalog(named, 'name', 'asc').map((r) => r.name)).toEqual(['Avatar', 'Buzzard', 'Charon']);
  });

  it('does not mutate the input array', () => {
    const rows = [row({ margin: 10 }), row({ margin: 90 })];
    sortCatalog(rows, 'margin', 'desc');
    expect(rows.map((r) => r.margin)).toEqual([10, 90]);
  });
});

describe('filterByMarginBand', () => {
  it('keeps everything for the "all" band', () => {
    const rows = [row({ margin: -5 }), row({ margin: 0 }), row({ margin: 10 }), row({ margin: null })];
    expect(filterByMarginBand(rows, 'all')).toHaveLength(4);
  });

  it('keeps only strictly-positive margins for "profitable"', () => {
    const rows = [row({ margin: -5 }), row({ margin: 0 }), row({ margin: 10 }), row({ margin: null })];
    expect(filterByMarginBand(rows, 'profitable').map((r) => r.margin)).toEqual([10]);
  });
});
