import { describe, expect, it } from 'vitest';
import type { ConsolidatedItem, ConsolidatedTier } from './build-consolidate';
import {
  isEfficiencyEligible,
  levelAt,
  tierColumnView,
  unitPriceMap,
} from './build-plan-view';
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
    [3, null], // unpriced
  ]);

  it('shows whole-run batched quantities and a summed subtotal with no focus', () => {
    const view = tierColumnView(tier(1, [item({ typeId: 1, quantity: 10 }), item({ typeId: 2, quantity: 4 })]), {
      focus: null,
      inChain: null,
      actualLevel: null,
      unitPriceOf: prices,
    });
    expect(view.rows.map((r) => r.qty)).toEqual([10, 4]);
    expect(view.rows.every((r) => !r.selected && !r.related && !r.faded)).toBe(true);
    // 10×100 + 4×50 = 1200.
    expect(view.subtotal).toBe(1200);
  });

  it('nulls a row value (and drops it from the subtotal) when the type is unpriced', () => {
    const view = tierColumnView(tier(1, [item({ typeId: 3, quantity: 5 })]), {
      focus: null,
      inChain: null,
      actualLevel: null,
      unitPriceOf: prices,
    });
    expect(view.rows[0].value).toBeNull();
    expect(view.subtotal).toBe(0);
  });

  it('lights the focused cell, relates its chain (at actual qty), and fades the rest', () => {
    const view = tierColumnView(tier(2, [item({ typeId: 1 }), item({ typeId: 2, quantity: 10 }), item({ typeId: 9 })]), {
      focus: { depth: 2, typeId: 1 },
      inChain: new Set([2]),
      actualLevel: new Map([[2, 3]]), // the related node actually consumes 3, not its batch 10
      unitPriceOf: prices,
    });
    const [a, b, c] = view.rows;
    expect(a.selected).toBe(true);
    expect(b.related).toBe(true);
    expect(b.qty).toBe(3); // actual consumed, not the batch quantity
    expect(c.faded).toBe(true);
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

describe('levelAt', () => {
  const map = new Map<number, Set<number>>([[1, new Set([7])]]);

  it('is null when nothing is focused or the map is absent', () => {
    expect(levelAt(map, null, 3)).toBeNull();
    expect(levelAt<Set<number>>(null, { depth: 2, typeId: 1 }, 3)).toBeNull();
  });

  it('reads the relative depth (tierDepth − focusDepth) slice, or null when absent', () => {
    // focus at depth 2, tier at depth 3 → relative depth 1.
    expect(levelAt(map, { depth: 2, typeId: 1 }, 3)).toEqual(new Set([7]));
    expect(levelAt(map, { depth: 2, typeId: 1 }, 9)).toBeNull();
  });
});
