import { describe, expect, it } from 'vitest';
import { tickIndices } from './trend-chart';

describe('tickIndices', () => {
  it('handles empty, single-point, and short series', () => {
    expect(tickIndices(0, 5)).toEqual([]);
    expect(tickIndices(1, 5)).toEqual([0]);
    expect(tickIndices(30, 1)).toEqual([0]);
    expect(tickIndices(3, 5)).toEqual([0, 1, 2]);
    expect(tickIndices(2, 5)).toEqual([0, 1]);
  });

  it('spaces ticks evenly and always includes first and last', () => {
    const idx = tickIndices(30, 5);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(29);
    expect(idx).toHaveLength(5);
    expect(tickIndices(29, 5)).toEqual([0, 7, 14, 21, 28]);
  });
});
