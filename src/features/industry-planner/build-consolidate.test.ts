import { describe, expect, it } from 'vitest';
import { consolidateBuild } from './build-consolidate';
import type { BlueprintStructure } from './types';

// Product (d0) ← Comp A (d1) ← Raw R (3) + Raw Q (2)
//             ← Comp B (d1) ← Raw R (4)
//             ← Raw R (5, consumed directly by the product at depth 1)
// Raw R is consumed at depth 1 (5) and depth 2 (3 + 4 = 7); per-tier amounts
// sum to its grand total of 12.
function makeStructure(): BlueprintStructure {
  return {
    buildNodeDisplay: {
      1: { name: 'Product', height: 2, isRaw: false, label: 'Ship', tone: 'teal' },
      2: { name: 'Comp A', height: 1, isRaw: false, label: 'Reaction', tone: 'purple' },
      3: { name: 'Comp B', height: 1, isRaw: false, label: 'Reaction', tone: 'purple' },
      8: { name: 'Raw Q', height: 0, isRaw: true, label: 'Gas', tone: 'teal' },
      9: { name: 'Raw R', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
    },
    buildTree: [
      {
        typeId: 1,
        quantity: 1,
        inputs: [
          {
            typeId: 2,
            quantity: 1,
            inputs: [
              { typeId: 9, quantity: 3, inputs: [] },
              { typeId: 8, quantity: 2, inputs: [] },
            ],
          },
          { typeId: 3, quantity: 1, inputs: [{ typeId: 9, quantity: 4, inputs: [] }] },
          { typeId: 9, quantity: 5, inputs: [] },
        ],
      },
    ],
    materialNames: { 1: 'Product', 2: 'Comp A', 3: 'Comp B', 8: 'Raw Q', 9: 'Raw R' },
  } as unknown as BlueprintStructure;
}

describe('consolidateBuild', () => {
  const { tiers, descendants, childrenOf } = consolidateBuild(makeStructure());

  it('produces a tier per depth, product-side first (no product tier)', () => {
    expect(tiers.map((t) => t.depth)).toEqual([1, 2]);
  });

  it('tier 1 lists every direct input — buildables first, then raws', () => {
    expect(tiers[0].items.map((i) => i.typeId)).toEqual([2, 3, 9]);
    expect(tiers[0].items.map((i) => i.isRaw)).toEqual([false, false, true]);
  });

  it('shows a raw at each depth it is consumed, with the per-tier amount', () => {
    const rDepth1 = tiers[0].items.find((i) => i.typeId === 9);
    const rDepth2 = tiers[1].items.find((i) => i.typeId === 9);
    expect(rDepth1?.quantity).toBe(5); // consumed directly by the product
    expect(rDepth2?.quantity).toBe(7); // 3 (Comp A) + 4 (Comp B)
  });

  it('sorts within a tier by type then name', () => {
    // depth 2: Raw Q (Gas) before Raw R (Mineral)
    expect(tiers[1].items.map((i) => i.typeId)).toEqual([8, 9]);
  });

  it('maps each buildable to its full downstream chain', () => {
    expect([...(descendants.get(2) ?? [])].sort()).toEqual([8, 9]);
    expect([...(descendants.get(3) ?? [])].sort()).toEqual([9]);
    expect([...(descendants.get(1) ?? [])].sort()).toEqual([2, 3, 8, 9]);
  });

  it('maps each type to its DIRECT inputs only (for walking a subtree by depth)', () => {
    expect([...(childrenOf.get(1) ?? [])].sort()).toEqual([2, 3, 9]);
    expect([...(childrenOf.get(2) ?? [])].sort()).toEqual([8, 9]);
    expect([...(childrenOf.get(3) ?? [])].sort()).toEqual([9]);
    // Raws have no inputs.
    expect([...(childrenOf.get(9) ?? [])]).toEqual([]);
  });
});
