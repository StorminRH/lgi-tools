import { describe, expect, it } from 'vitest';
import { paginationItems } from './pagination-model';

describe('paginationItems', () => {
  it('shows every page for short result sets', () => {
    expect(paginationItems(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the current neighborhood and both endpoints', () => {
    expect(paginationItems(6, 12)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 12]);
  });

  it('does not add an ellipsis when endpoint ranges touch', () => {
    expect(paginationItems(2, 12)).toEqual([1, 2, 3, 'ellipsis', 12]);
  });
});
