import { describe, expect, it } from 'vitest';
import type { SearchResult, SearchSection } from '@/search';
import {
  deriveGlobalSearchView,
  deriveSearchRowView,
  isArrowKey,
  sectionOffset,
  splitMatchRuns,
} from './global-search-view';

const result = (over: Partial<SearchResult> = {}): SearchResult =>
  ({ id: 'x', label: 'Item', href: '/x', ...over }) as SearchResult;

describe('splitMatchRuns', () => {
  it('returns one unmatched run when there are no indices', () => {
    expect(splitMatchRuns('Tritanium')).toEqual([{ matched: false, text: 'Tritanium' }]);
    expect(splitMatchRuns('Tritanium', [])).toEqual([{ matched: false, text: 'Tritanium' }]);
  });

  it('collapses adjacent matched chars into a single run', () => {
    expect(splitMatchRuns('Tritan', [0, 1, 2])).toEqual([
      { matched: true, text: 'Tri' },
      { matched: false, text: 'tan' },
    ]);
  });

  it('interleaves matched and unmatched runs', () => {
    expect(splitMatchRuns('abcd', [1, 3])).toEqual([
      { matched: false, text: 'a' },
      { matched: true, text: 'b' },
      { matched: false, text: 'c' },
      { matched: true, text: 'd' },
    ]);
  });
});

describe('isArrowKey', () => {
  it('is true only for the vertical arrows', () => {
    expect(isArrowKey('ArrowDown')).toBe(true);
    expect(isArrowKey('ArrowUp')).toBe(true);
    expect(isArrowKey('Enter')).toBe(false);
  });
});

describe('sectionOffset', () => {
  it('sums the result counts of the preceding sections', () => {
    const sections = [
      { name: 'Sites', results: [result(), result()] },
      { name: 'Tools', results: [result()] },
      { name: 'Commands', results: [result(), result(), result()] },
    ] as SearchSection[];
    expect(sectionOffset(sections, 0)).toBe(0);
    expect(sectionOffset(sections, 1)).toBe(2);
    expect(sectionOffset(sections, 2)).toBe(3);
  });
});

describe('deriveGlobalSearchView', () => {
  it('opens the dropdown only when active with sections', () => {
    expect(
      deriveGlobalSearchView({ active: true, sectionCount: 2, activeIndex: 0, flatRowCount: 4 })
        .showDropdown,
    ).toBe(true);
    expect(
      deriveGlobalSearchView({ active: false, sectionCount: 2, activeIndex: 0, flatRowCount: 4 })
        .showDropdown,
    ).toBe(false);
    expect(
      deriveGlobalSearchView({ active: true, sectionCount: 0, activeIndex: 0, flatRowCount: 0 })
        .showDropdown,
    ).toBe(false);
  });

  it('carries the active class and drops aria-controls when closed', () => {
    const open = deriveGlobalSearchView({ active: true, sectionCount: 1, activeIndex: 0, flatRowCount: 1 });
    expect(open.wrapperClass).toBe('nav-search active');
    expect(open.ariaControls).toBeTypeOf('string');

    const closed = deriveGlobalSearchView({ active: false, sectionCount: 0, activeIndex: 0, flatRowCount: 0 });
    expect(closed.wrapperClass).toBe('nav-search ');
    expect(closed.ariaControls).toBeUndefined();
  });
});

describe('deriveSearchRowView', () => {
  it('marks the active row and falls back for icon text/tone', () => {
    const view = deriveSearchRowView(result({ label: 'Tritanium', disabled: true }), true);
    expect(view.rowClass).toBe('dd-row active disabled');
    expect(view.iconMono).toBe('Tr'); // first two chars when no iconText
    expect(view.iconClass).toBe('dd-icon ');
  });

  it('uses explicit icon text and tone when present', () => {
    const view = deriveSearchRowView(result({ iconText: 'WH', iconTone: 'green' }), false);
    expect(view.rowClass).toBe('dd-row  ');
    expect(view.iconMono).toBe('WH');
    expect(view.iconClass).toBe('dd-icon green');
  });
});
