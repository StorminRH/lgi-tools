import { expect, test } from 'vitest';
import { continuousHoverTarget, tickAnchor } from './chart-geometry';

const data = [
  { x: 0, y: 5 },
  { x: 10, y: 7 },
  { x: 20, y: 3 },
];
const xs = data.map((d) => d.x);

test('hover snaps to the nearest datum, clamps to the ends, and is empty for no series', () => {
  expect(continuousHoverTarget(xs, 9, data)).toEqual({ datum: data[1], index: 1 });
  expect(continuousHoverTarget(xs, 18, data)).toEqual({ datum: data[2], index: 2 });
  expect(continuousHoverTarget(xs, -100, data)).toEqual({ datum: data[0], index: 0 });
  expect(continuousHoverTarget(xs, 999, data)).toEqual({ datum: data[2], index: 2 });
  expect(continuousHoverTarget([], 5, [])).toBeNull();
});

test('tick labels grow inward from the edges and a lone label stays centred', () => {
  expect([0, 1, 2, 3].map((i) => tickAnchor(i, 4))).toEqual(['start', 'middle', 'middle', 'end']);
  expect(tickAnchor(0, 1)).toBe('middle');
});
