import { describe, expect, it } from 'vitest';
import type { ConsolidatedItem, ConsolidatedTier } from './build-consolidate';
import {
  isEfficiencyEligible,
  tierColumnView,
  unitPriceMap,
} from './build-plan-view';
import { batchedCostOfRows } from './cost-basis-view';
import { REACTION_NODE_LABEL } from './industry-styles';

const item = (over: Partial<ConsolidatedItem> & { typeId: number }): ConsolidatedItem => ({
  name: `Item ${over.typeId}`,
  label: 'Component',
  tone: 'green',
  isRaw: false,
  quantity: 10,
  hasChildren: false,
  ...over,
});
const tier = (depth: number, items: ConsolidatedItem[]): ConsolidatedTier => ({ depth, items });

describe('tierColumnView', () => {
  const prices = new Map<number, number | null>([
    [1, 100],
    [2, 50],
    [3, null],
  ]);

  it('shows whole-run batched quantities and a summed subtotal, nothing lit', () => {
    const view = tierColumnView(tier(1, [item({ typeId: 1, quantity: 10 }), item({ typeId: 2, quantity: 4 })]), {
      unitPriceOf: prices,
      lit: null,
    });
    expect(view.rows.map((r) => r.qty)).toEqual([10, 4]);
    expect(view.rows.every((r) => !r.lit && !r.dimmed)).toBe(true);
    expect(view.subtotal).toBe(1200);
  });

  it('nulls a row value (and drops it from the subtotal) when the type is unpriced', () => {
    const view = tierColumnView(tier(1, [item({ typeId: 3, quantity: 5 })]), { unitPriceOf: prices, lit: null });
    expect(view.rows[0]!.value).toBeNull();
    expect(view.subtotal).toBe(0);
  });

  it('lights the hovered chain and dims the rest, leaving quantities alone', () => {
    const view = tierColumnView(tier(2, [item({ typeId: 1 }), item({ typeId: 2 }), item({ typeId: 9 })]), {
      unitPriceOf: prices,
      lit: new Set([1, 2]),
    });
    expect(view.rows.map((r) => [r.lit, r.dimmed])).toEqual([
      [true, false],
      [true, false],
      [false, true],
    ]);
    expect(view.rows.map((r) => r.qty)).toEqual([10, 10, 10]);
  });
});

describe('unitPriceMap', () => {
  it('is empty when there is no pricing', () => {
    expect(unitPriceMap(null).size).toBe(0);
  });

  it('maps raws to unit buy and intermediates to best sell (falling back to best buy)', () => {
    const m = unitPriceMap({
      rows: [{ typeId: 1, unitBuy: 100 }],
      intermediatePrices: [
        { typeId: 2, bestSell: 500, bestBuy: 400 },
        { typeId: 3, bestSell: null, bestBuy: 300 },
      ],
    });
    expect(m.get(1)).toBe(100);
    expect(m.get(2)).toBe(500);
    expect(m.get(3)).toBe(300);
  });
});

describe('isEfficiencyEligible', () => {
  it('is true only for a manufacturable buildable (has a blueprint, not a reaction)', () => {
    expect(isEfficiencyEligible(46175, 'Component')).toBe(true);
    expect(isEfficiencyEligible(undefined, 'Component')).toBe(false);
    expect(isEfficiencyEligible(46175, REACTION_NODE_LABEL)).toBe(false);
  });
});

describe('batchedCostOfRows', () => {
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
