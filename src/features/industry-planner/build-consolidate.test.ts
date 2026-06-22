import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { computeBatchLedger, computeBatchMaterials } from './build-batch';
import { chainLevelsFrom, consolidateBuild, scaleTiersToBatched } from './build-consolidate';
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

describe('chainLevelsFrom', () => {
  const { childrenOf } = consolidateBuild(makeStructure());

  it('indexes a buildable’s chain by depth relative to the focus', () => {
    const levels = chainLevelsFrom(2, childrenOf);
    expect([...(levels.get(0) ?? [])]).toEqual([2]); // the focused item
    expect([...(levels.get(1) ?? [])].sort()).toEqual([8, 9]); // its direct inputs
    expect(levels.has(2)).toBe(false); // raws have no children → the chain stops
  });

  it('walks the product’s whole chain across depths', () => {
    const levels = chainLevelsFrom(1, childrenOf);
    expect([...(levels.get(1) ?? [])].sort()).toEqual([2, 3, 9]);
    expect([...(levels.get(2) ?? [])].sort()).toEqual([8, 9]);
  });

  it('returns just the root for a raw (no chain)', () => {
    const levels = chainLevelsFrom(9, childrenOf);
    expect([...(levels.get(0) ?? [])]).toEqual([9]);
    expect(levels.size).toBe(1);
  });
});

describe('scaleTiersToBatched', () => {
  // Product 999 → component X (100, made 10/run, consuming 7 of raw R per run) →
  // raw R (200). One run of the product needs 5 of X (a half batch on the
  // marginal basis), so the marginal tree charges 3.5 R; the whole-run build runs
  // X once → produces 10 X and bears a full run's 7 R.
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
  ];
  const display = {
    100: { name: 'Comp X', height: 1, isRaw: false, label: 'Reaction', tone: 'purple' },
    200: { name: 'Raw R', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
    999: { name: 'Product', height: 2, isRaw: false, label: 'Ship', tone: 'teal' },
  };
  // The matching marginal buildTree: X at 5 (one product run), its R at 3.5 (7 × 5/10).
  const structure = {
    buildNodeDisplay: display,
    buildTree: [
      {
        typeId: 999,
        quantity: 1,
        inputs: [
          {
            typeId: 100,
            quantity: 5,
            inputs: [{ typeId: 200, quantity: 3.5, inputs: [] }],
          },
        ],
      },
    ],
    materialNames: { 100: 'Comp X', 200: 'Raw R', 999: 'Product' },
  } as unknown as BlueprintStructure;

  const scaled = scaleTiersToBatched(
    consolidateBuild(structure).tiers,
    computeBatchLedger(tree, 1),
  );
  const cell = (depth: number, typeId: number) =>
    scaled.find((t) => t.depth === depth)?.items.find((i) => i.typeId === typeId)?.quantity;

  it('shows a buildable as its whole-run produced batch (runs × yield)', () => {
    // ⌈5/10⌉ = 1 run × 10/run = 10 produced, not the 5 marginal.
    expect(cell(1, 100)).toBe(10);
  });

  it('shows a raw at its whole-run batch total — equal to computeBatchMaterials', () => {
    const batchTotal = computeBatchMaterials(tree, 1).find((r) => r.typeId === 200)?.quantity;
    expect(batchTotal).toBe(7);
    expect(cell(2, 200)).toBe(7);
  });
});

describe('scaleTiersToBatched — multi-depth raw sums to the batch total', () => {
  // Raw R is consumed by X (→ 7 whole-run) AND directly by the product (5), so its
  // batch total is 12, split across the two depths it appears at. The per-depth
  // cells must still SUM to 12 (= computeBatchMaterials), the success criterion.
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
    { typeId: 200, quantity: 5, inputs: [] },
  ];
  const structure = {
    buildNodeDisplay: {
      100: { name: 'Comp X', height: 1, isRaw: false, label: 'Reaction', tone: 'purple' },
      200: { name: 'Raw R', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
      999: { name: 'Product', height: 2, isRaw: false, label: 'Ship', tone: 'teal' },
    },
    buildTree: [
      {
        typeId: 999,
        quantity: 1,
        inputs: [
          { typeId: 100, quantity: 5, inputs: [{ typeId: 200, quantity: 3.5, inputs: [] }] },
          { typeId: 200, quantity: 5, inputs: [] },
        ],
      },
    ],
    materialNames: { 100: 'Comp X', 200: 'Raw R', 999: 'Product' },
  } as unknown as BlueprintStructure;

  it('per-depth raw cells sum to the whole-run batch total', () => {
    const scaled = scaleTiersToBatched(
      consolidateBuild(structure).tiers,
      computeBatchLedger(tree, 1),
    );
    const rCells = scaled.flatMap((t) => t.items.filter((i) => i.typeId === 200).map((i) => i.quantity));
    expect(rCells.length).toBe(2); // R appears at depth 1 (direct) and depth 2 (via X)
    const sum = rCells.reduce((a, b) => a + b, 0);
    const batchTotal = computeBatchMaterials(tree, 1).find((r) => r.typeId === 200)?.quantity;
    expect(batchTotal).toBe(12);
    expect(sum).toBeCloseTo(12, 9);
  });
});
