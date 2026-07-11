import { describe, it, expect } from 'vitest';
import { buildSortHref, deriveSortHeaderCells } from './sortable-table-view';

describe('buildSortHref', () => {
  it('sets the sort + dir params and preserves other params', () => {
    const href = buildSortHref('/sites', { class: 'C5', sort: 'name', dir: 'asc' }, 'sort', 'dir', 'isk', 'desc');
    expect(href).toBe('/sites?class=C5&sort=isk&dir=desc');
  });

  it('drops the prior sort/dir params (never stacks them)', () => {
    const href = buildSortHref('/sites', { sort: 'old', dir: 'asc' }, 'sort', 'dir', 'new', 'desc');
    expect(href).toBe('/sites?sort=new&dir=desc');
  });

  it('skips empty param values', () => {
    const href = buildSortHref('/sites', { class: undefined, type: '' }, 'sort', 'dir', 'isk', 'asc');
    expect(href).toBe('/sites?sort=isk&dir=asc');
  });
});

describe('deriveSortHeaderCells', () => {
  const base = {
    sortKey: 'name' as string | null,
    sortDir: 'asc' as 'asc' | 'desc',
    basePath: '/sites',
    currentParams: {},
    sortParam: 'sort',
    dirParam: 'dir',
  };

  it('non-sortable column: no href, no indicator, right align maps to right classes', () => {
    const cell = deriveSortHeaderCells({
      ...base,
      columns: [{ key: 'x', label: 'X', sortable: false, align: 'right' }],
    })[0]!;
    expect(cell.href).toBeNull();
    expect(cell.indicator).toBeNull();
    expect(cell.alignClass).toBe('justify-end text-right');
  });

  it('active column toggles direction and shows the current-direction glyph', () => {
    const cell = deriveSortHeaderCells({ ...base, columns: [{ key: 'name', label: 'Name' }] })[0]!;
    expect(cell.isActive).toBe(true);
    expect(cell.indicator).toBe('▲'); // current dir asc
    expect(cell.href).toContain('dir=desc'); // clicking toggles to desc
  });

  it('inactive column uses defaultDirFor, else desc', () => {
    const cells = deriveSortHeaderCells({
      ...base,
      columns: [
        { key: 'isk', label: 'ISK' },
        { key: 'ehp', label: 'EHP' },
      ],
      defaultDirFor: (k) => (k === 'ehp' ? 'asc' : 'desc'),
    });
    expect(cells[0]!.indicator).toBeNull();
    expect(cells[0]!.href).toContain('dir=desc'); // no override → desc
    expect(cells[1]!.href).toContain('dir=asc'); // override → asc
  });
});
