import { describe, expect, it } from 'vitest';
import { tickIndices } from './trend-chart';

describe('tickIndices', () => {
  it('empty series gives no ticks', () => {
    expect(tickIndices(0, 5)).toEqual([]);
  });

  it('single point gets one tick at index 0', () => {
    expect(tickIndices(1, 5)).toEqual([0]);
  });

  it('max of 1 collapses to the first index', () => {
    expect(tickIndices(30, 1)).toEqual([0]);
  });

  it('short series shows every index', () => {
    expect(tickIndices(3, 5)).toEqual([0, 1, 2]);
  });

  it('always includes the first and last index', () => {
    const idx = tickIndices(30, 5);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(29);
    expect(idx).toHaveLength(5);
  });

  it('spacing is even', () => {
    expect(tickIndices(29, 5)).toEqual([0, 7, 14, 21, 28]);
  });

  it('never emits duplicate indices', () => {
    const idx = tickIndices(2, 5);
    expect(idx).toEqual([0, 1]);
  });
});
