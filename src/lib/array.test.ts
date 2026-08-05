import { describe, expect, it } from 'vitest';
import { chunk, dedupe } from './array';

// These two feed ESI id batching (market prices, ingest, affiliations); a
// remainder-chunk or ordering bug ships silently because consumer fixtures
// never exceed the batch size — this is the only direct falsifier.
describe('array helpers', () => {
  it('chunks with a remainder group and dedupes preserving first-seen order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    expect(chunk([], 3)).toEqual([]);

    expect(dedupe([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    expect(dedupe([])).toEqual([]);
  });
});
