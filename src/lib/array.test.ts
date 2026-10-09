import { describe, expect, it, vi } from 'vitest';
import { chunk, dedupe, getOrInsertComputed, groupBy } from './array';

describe('array helpers', () => {
  it('chunks with a remainder group and dedupes preserving first-seen order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    expect(chunk([], 3)).toEqual([]);

    expect(dedupe([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    expect(dedupe([])).toEqual([]);
  });
});

describe('groupBy', () => {
  it('keeps first-seen key order and input order within each group, with or without a value mapper', () => {
    const rows = [
      { map: 'b', id: 1 },
      { map: 'a', id: 2 },
      { map: 'b', id: 3 },
      { map: 'c', id: 4 },
      { map: 'a', id: 5 },
    ];

    const byMap = groupBy(rows, (row) => row.map);
    expect([...byMap.keys()]).toEqual(['b', 'a', 'c']);
    expect(byMap.get('b')).toEqual([{ map: 'b', id: 1 }, { map: 'b', id: 3 }]);
    expect(byMap.get('a')).toEqual([{ map: 'a', id: 2 }, { map: 'a', id: 5 }]);
    expect(byMap.get('c')).toEqual([{ map: 'c', id: 4 }]);

    const idsByMap = groupBy(rows, (row) => row.map, (row) => row.id);
    expect([...idsByMap]).toEqual([['b', [1, 3]], ['a', [2, 5]], ['c', [4]]]);
  });

  it('reads any iterable once and returns an empty map for no items', () => {
    function* numbers() {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
    }
    expect([...groupBy(numbers(), (n) => n % 2 === 0)]).toEqual([[false, [1, 3]], [true, [2, 4]]]);
    expect(groupBy([], () => 'never').size).toBe(0);
  });
});

describe('getOrInsertComputed', () => {
  it('computes and stores only on a miss and returns a stored falsy value without recomputing', () => {
    const counts = new Map<string, number | undefined>([['zero', 0], ['unset', undefined]]);
    const compute = vi.fn((key: string) => key.length);

    expect(getOrInsertComputed(counts, 'zero', compute)).toBe(0);
    expect(getOrInsertComputed(counts, 'unset', compute)).toBeUndefined();
    expect(compute).not.toHaveBeenCalled();

    expect(getOrInsertComputed(counts, 'three', compute)).toBe(5);
    expect(compute).toHaveBeenCalledWith('three');
    expect(counts.get('three')).toBe(5);

    expect(getOrInsertComputed(counts, 'three', compute)).toBe(5);
    expect(compute).toHaveBeenCalledTimes(1);

    const labels = new Map<number, string>([[1, '']]);
    expect(getOrInsertComputed(labels, 1, () => 'recomputed')).toBe('');
    expect(labels.get(1)).toBe('');
  });

  it('returns the stored container so callers can append in place', () => {
    const buckets = new Map<string, number[]>();
    getOrInsertComputed(buckets, 'a', () => []).push(1);
    getOrInsertComputed(buckets, 'a', () => []).push(2);
    expect(buckets.get('a')).toEqual([1, 2]);
  });
});
