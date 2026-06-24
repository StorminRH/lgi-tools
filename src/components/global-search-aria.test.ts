import { describe, expect, it } from 'vitest';
import {
  SEARCH_LISTBOX_ID,
  nextActiveIndex,
  searchActiveDescendantId,
  searchOptionId,
} from './global-search-aria';

describe('nextActiveIndex', () => {
  it('ArrowDown moves down and clamps at the last row', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextActiveIndex(2, 'ArrowDown', 3)).toBe(2);
  });

  it('ArrowUp moves up and clamps at 0', () => {
    expect(nextActiveIndex(2, 'ArrowUp', 3)).toBe(1);
    expect(nextActiveIndex(0, 'ArrowUp', 3)).toBe(0);
  });

  it('stays at 0 when there are no rows', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 0)).toBe(0);
    expect(nextActiveIndex(0, 'ArrowUp', 0)).toBe(0);
  });

  it('leaves the index unchanged for non-arrow keys', () => {
    expect(nextActiveIndex(1, 'Enter', 3)).toBe(1);
    expect(nextActiveIndex(1, 'a', 3)).toBe(1);
  });
});

describe('searchActiveDescendantId', () => {
  it('points at the active option when open and in range', () => {
    expect(searchActiveDescendantId(1, 3, true)).toBe(searchOptionId(1));
    expect(searchActiveDescendantId(1, 3, true)).toBe('global-search-opt-1');
  });

  it('is undefined when the dropdown is closed', () => {
    expect(searchActiveDescendantId(1, 3, false)).toBeUndefined();
  });

  it('is undefined when there are no rows', () => {
    expect(searchActiveDescendantId(0, 0, true)).toBeUndefined();
  });

  it('is undefined when the index is out of range', () => {
    expect(searchActiveDescendantId(5, 3, true)).toBeUndefined();
    expect(searchActiveDescendantId(-1, 3, true)).toBeUndefined();
  });
});

describe('listbox / option id contract', () => {
  it('option ids are stable and distinct by index', () => {
    expect(searchOptionId(0)).toBe('global-search-opt-0');
    expect(searchOptionId(2)).not.toBe(searchOptionId(3));
  });

  it('exposes a stable listbox id for aria-controls', () => {
    expect(SEARCH_LISTBOX_ID).toBe('global-search-listbox');
  });
});
