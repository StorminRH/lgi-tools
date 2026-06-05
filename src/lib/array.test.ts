import { describe, expect, it } from 'vitest';
import { chunk, dedupe } from './array';

describe('dedupe', () => {
  it('removes duplicates, preserving first-seen order', () => {
    expect(dedupe([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('works on strings', () => {
    expect(dedupe(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupe([])).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups, last is the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk when the size exceeds the length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
