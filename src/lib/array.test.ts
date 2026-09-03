import { describe, expect, it } from 'vitest';
import { chunk, dedupe } from './array';

describe('array helpers', () => {
  it('chunks with a remainder group and dedupes preserving first-seen order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    expect(chunk([], 3)).toEqual([]);

    expect(dedupe([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    expect(dedupe([])).toEqual([]);
  });
});
