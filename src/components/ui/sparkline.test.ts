import { describe, it, expect } from 'vitest';
import { extent, paddedDomain, nearestIndex } from './sparkline';

describe('extent', () => {
  it('returns [min, max] regardless of order', () => {
    expect(extent([3, 1, 4, 1, 5, 9, 2])).toEqual([1, 9]);
  });

  it('handles a single value', () => {
    expect(extent([7])).toEqual([7, 7]);
  });

  it('handles negatives', () => {
    expect(extent([-5, -1, -10])).toEqual([-10, -1]);
  });
});

describe('paddedDomain', () => {
  it('adds 10% headroom on both ends of a real range', () => {
    // range 0..100 → pad 10 → [-10, 110]
    expect(paddedDomain([0, 50, 100])).toEqual([-10, 110]);
  });

  it('gives a flat series a non-degenerate domain', () => {
    // min === max === 50 → pad falls back to 10% of |value| = 5
    expect(paddedDomain([50, 50, 50])).toEqual([45, 55]);
  });

  it('falls back to ±1 when value is zero and flat', () => {
    expect(paddedDomain([0, 0])).toEqual([-1, 1]);
  });
});

describe('nearestIndex', () => {
  const xs = [0, 10, 20, 30, 40];

  it('finds the closest x', () => {
    expect(nearestIndex(xs, 22)).toBe(2);
    expect(nearestIndex(xs, 8)).toBe(1);
  });

  it('clamps to the ends', () => {
    expect(nearestIndex(xs, -100)).toBe(0);
    expect(nearestIndex(xs, 999)).toBe(4);
  });

  it('returns the lower index on a tie', () => {
    // 15 is equidistant from xs[1]=10 and xs[2]=20; strict `<` keeps the first.
    expect(nearestIndex(xs, 15)).toBe(1);
  });

  it('returns -1 for an empty series', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });
});
