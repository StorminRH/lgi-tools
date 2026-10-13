import { expect, test, vi } from 'vitest';
import { breadthFirst, pathTo } from './graph';

// 1 - 2 - 4 - 5, with 3 a second route from 1 to 4.
const DIAMOND = new Map<number, readonly number[]>([
  [1, [2, 3]],
  [2, [1, 4]],
  [3, [1, 4]],
  [4, [2, 3, 5]],
  [5, [4]],
]);
const diamond = (id: number): readonly number[] => DIAMOND.get(id) ?? [];

// 0 - 1 - 2 - ... - 20
const corridor = (id: number): readonly number[] =>
  [id - 1, id + 1].filter((next) => next >= 0 && next <= 20);

test('breadthFirst records depth and the first-discovery parent in discovery order, and pathTo walks back to the source', () => {
  const reached = breadthFirst([1], diamond);

  expect([...reached]).toEqual([
    [1, { depth: 0, parent: null }],
    [2, { depth: 1, parent: 1 }],
    [3, { depth: 1, parent: 1 }],
    [4, { depth: 2, parent: 2 }],
    [5, { depth: 3, parent: 4 }],
  ]);
  expect(pathTo(reached, 5)).toEqual([1, 2, 4, 5]);
  expect(pathTo(reached, 3)).toEqual([1, 3]);
  expect(pathTo(reached, 1)).toEqual([1]);
  expect(pathTo(reached, 99)).toBeNull();
});

test('breadthFirst seeds sources at depth 0 in the given order, so the earlier source wins shared discoveries', () => {
  const twoFirst = breadthFirst([2, 3, 2], diamond);
  expect([...twoFirst.keys()]).toEqual([2, 3, 1, 4, 5]);
  expect(twoFirst.get(3)).toEqual({ depth: 0, parent: null });
  expect(pathTo(twoFirst, 5)).toEqual([2, 4, 5]);
  expect(pathTo(twoFirst, 1)).toEqual([2, 1]);

  const threeFirst = breadthFirst([3, 2], diamond);
  expect([...threeFirst.keys()]).toEqual([3, 2, 1, 4, 5]);
  expect(pathTo(threeFirst, 5)).toEqual([3, 4, 5]);
  expect(pathTo(threeFirst, 1)).toEqual([3, 1]);

  const neighbours = vi.fn(diamond);
  const none = breadthFirst([], neighbours);
  expect(none.size).toBe(0);
  expect(pathTo(none, 1)).toBeNull();
  expect(neighbours).not.toHaveBeenCalled();
});

test('breadthFirst keeps the level at maxDepth and nothing past it', () => {
  const reached = breadthFirst([0], corridor, { maxDepth: 15 });

  expect(reached.get(15)).toEqual({ depth: 15, parent: 14 });
  expect(pathTo(reached, 15)).toHaveLength(16);
  expect(pathTo(reached, 16)).toBeNull();
  expect(reached.size).toBe(16);

  expect([...breadthFirst([0, 20], corridor, { maxDepth: 0 }).keys()]).toEqual([0, 20]);
  expect(breadthFirst([0], corridor).get(20)).toEqual({ depth: 20, parent: 19 });
});

test('breadthFirst stops after finishing the level that reaches the last target', () => {
  expect([...breadthFirst([1], diamond, { targets: new Set([2]) }).keys()]).toEqual([1, 2, 3]);
  expect([...breadthFirst([1], diamond, { targets: new Set([2, 4]) }).keys()]).toEqual([
    1, 2, 3, 4,
  ]);

  const unreachable = vi.fn(diamond);
  expect(breadthFirst([1], unreachable, { targets: new Set([99]) }).size).toBe(5);
  expect(unreachable).toHaveBeenCalledTimes(5);

  expect([...breadthFirst([1], diamond, { targets: new Set([1]) }).keys()]).toEqual([1]);
  expect([...breadthFirst([1], diamond, { targets: new Set() }).keys()]).toEqual([1]);

  const capped = breadthFirst([0], corridor, { maxDepth: 3, targets: new Set([10]) });
  expect(capped.size).toBe(4);
  expect(pathTo(capped, 10)).toBeNull();
});
