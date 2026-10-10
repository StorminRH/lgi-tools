import { expect, test } from 'vitest';
import { continuousHoverTarget, extent, paddedDomain, tickAnchor, tickIndices } from './chart-geometry';

test('extent spans a series in any order, a single value and negatives', () => {
  expect(extent([3, 1, 4, 1, 5, 9, 2])).toEqual([1, 9]);
  expect(extent([7])).toEqual([7, 7]);
  expect(extent([-5, -1, -10])).toEqual([-10, -1]);
});

test('a padded domain adds 10% headroom, pads a flat series by 10% of its value and an all-zero one by 1', () => {
  expect(paddedDomain([0, 50, 100])).toEqual([-10, 110]);
  expect(paddedDomain([50, 50, 50])).toEqual([45, 55]);
  expect(paddedDomain([0, 0])).toEqual([-1, 1]);
});

const data = [
  { x: 0, y: 5 },
  { x: 10, y: 7 },
  { x: 20, y: 3 },
];
const xs = data.map((d) => d.x);

test('hover snaps to the nearest datum, takes the earlier one on a tie, clamps to the ends, and is empty for no series', () => {
  expect(continuousHoverTarget(xs, 9, data)).toEqual({ datum: data[1], index: 1 });
  expect(continuousHoverTarget(xs, 18, data)).toEqual({ datum: data[2], index: 2 });
  expect(continuousHoverTarget(xs, 5, data)).toEqual({ datum: data[0], index: 0 });
  expect(continuousHoverTarget(xs, 15, data)).toEqual({ datum: data[1], index: 1 });
  expect(continuousHoverTarget(xs, -100, data)).toEqual({ datum: data[0], index: 0 });
  expect(continuousHoverTarget(xs, 999, data)).toEqual({ datum: data[2], index: 2 });
  expect(continuousHoverTarget([], 5, [])).toBeNull();
});

test('tick labels grow inward from the edges and a lone label stays centred', () => {
  expect([0, 1, 2, 3].map((i) => tickAnchor(i, 4))).toEqual(['start', 'middle', 'middle', 'end']);
  expect(tickAnchor(0, 1)).toBe('middle');
});

test('date labels spread up to the cap across a series and always keep its first and last day', () => {
  expect(tickIndices(0, 5)).toEqual([]);
  expect(tickIndices(1, 5)).toEqual([0]);
  expect(tickIndices(30, 1)).toEqual([0]);
  expect(tickIndices(3, 5)).toEqual([0, 1, 2]);
  expect(tickIndices(2, 5)).toEqual([0, 1]);
  const spread = tickIndices(30, 5);
  expect(spread[0]).toBe(0);
  expect(spread.at(-1)).toBe(29);
  expect(spread).toHaveLength(5);
  expect(tickIndices(29, 5)).toEqual([0, 7, 14, 21, 28]);
});
