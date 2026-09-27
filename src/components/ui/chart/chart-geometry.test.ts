import { describe, it, expect } from 'vitest';
import { continuousHoverTarget, tickAnchor } from './chart-geometry';

describe('continuousHoverTarget', () => {
  const data = [
    { x: 0, y: 5 },
    { x: 10, y: 7 },
    { x: 20, y: 3 },
  ];
  const xs = data.map((d) => d.x);

  it('resolves to the datum whose x is nearest the probe', () => {
    expect(continuousHoverTarget(xs, 9, data)).toEqual({ datum: data[1], index: 1 });
    expect(continuousHoverTarget(xs, 18, data)).toEqual({ datum: data[2], index: 2 });
  });

  it('clamps to the ends', () => {
    expect(continuousHoverTarget(xs, -100, data)).toEqual({ datum: data[0], index: 0 });
    expect(continuousHoverTarget(xs, 999, data)).toEqual({ datum: data[2], index: 2 });
  });

  it('returns null for an empty series', () => {
    expect(continuousHoverTarget([], 5, [])).toBeNull();
  });
});

describe('tickAnchor', () => {
  it('grows the edge labels inward and centres the rest', () => {
    expect([0, 1, 2, 3].map((i) => tickAnchor(i, 4))).toEqual(['start', 'middle', 'middle', 'end']);
  });

  it('centres a lone label', () => {
    expect(tickAnchor(0, 1)).toBe('middle');
  });
});
