import { describe, expect, it, vi } from 'vitest';
import {
  chunk,
  dedupe,
  getOrInsertComputed,
  groupBy,
  idsKey,
  parseIdsKey,
  sameItems,
  sortedUniqueIds,
} from './array';

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

describe('sorted id sets', () => {
  it('sorts distinct ids numerically, keys any iterable stably, and reads a key back without the [0] trap', () => {
    expect(sortedUniqueIds([10, 9, 10])).toEqual([9, 10]);
    expect(sortedUniqueIds(new Set([100, 20, 3]))).toEqual([3, 20, 100]);
    expect(sortedUniqueIds([])).toEqual([]);

    expect(idsKey([3, 1, 2, 1])).toBe('1,2,3');
    expect(idsKey(new Map([[100, 'a'], [20, 'b']]).keys())).toBe('20,100');
    expect(idsKey([])).toBe('');

    expect(parseIdsKey('')).toEqual([]);
    expect(parseIdsKey('7,3')).toEqual([7, 3]);
    expect(parseIdsKey(idsKey([100, 20, 100, 3]))).toEqual([3, 20, 100]);
  });
});

describe('sameItems', () => {
  it('compares element by element in order with ===, so -0 matches 0 and NaN never matches', () => {
    const stack: readonly string[] = ['intel', 'summary'];
    expect(sameItems(stack, ['intel', 'summary'])).toBe(true);
    expect(sameItems(stack, ['summary', 'intel'])).toBe(false);
    expect(sameItems(stack, ['intel'])).toBe(false);
    expect(sameItems(stack, ['intel', 'summary', 'intel'])).toBe(false);
    expect(sameItems([], [])).toBe(true);

    expect(sameItems([0, 1], [-0, 1])).toBe(true);
    expect(sameItems([NaN], [NaN])).toBe(false);
    expect(sameItems([undefined], [])).toBe(false);
  });

  it('applies a custom comparator at each index and skips it when the lengths differ', () => {
    const byId = vi.fn((a: { id: number; name: string }, b: { id: number; name: string }) => a.id === b.id);
    const left = [{ id: 1, name: 'Ava' }, { id: 2, name: 'Bo' }];

    expect(sameItems(left, [{ id: 1, name: 'renamed' }, { id: 2, name: 'Bo' }], byId)).toBe(true);
    expect(byId).toHaveBeenCalledTimes(2);
    expect(sameItems(left, [{ id: 2, name: 'Bo' }, { id: 1, name: 'Ava' }], byId)).toBe(false);

    byId.mockClear();
    expect(sameItems(left, [{ id: 1, name: 'Ava' }], byId)).toBe(false);
    expect(byId).not.toHaveBeenCalled();
  });
});
