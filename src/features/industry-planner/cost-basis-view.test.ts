import { describe, expect, it } from 'vitest';
import { batchedCostOfRows } from './cost-basis-view';

describe('cost-basis view helpers', () => {

  it('sums the batched rows, treating unpriced lines as 0', () => {
    expect(
      batchedCostOfRows([
        { extendedCost: 100 },
        { extendedCost: null },
        { extendedCost: 2.5 },
      ]),
    ).toBe(102.5);
    expect(batchedCostOfRows([])).toBe(0);
  });
});
