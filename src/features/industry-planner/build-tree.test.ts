import { describe, expect, it } from 'vitest';
import type { TypeLabel } from '@/data/eve-data/queries';
import { computeHeights, type TreeNode } from '@/data/eve-data/tree-resolver';
import { toBuildTree } from './build-tree';

// A small build: product (1, a Frigate) ← a manufactured component (2) made
// from 100 of a mineral (99), a reaction output (3) made from a mineral (98),
// and a direct raw (4). Component 2 is needed ×3; reaction 3 is needed ×5 but
// yields 10/run, so it runs a fractional 0.5 — the marginal basis.
function fixture() {
  const tree: TreeNode[] = [
    {
      typeId: 2,
      quantity: 3,
      producedBy: { blueprintTypeId: 1002, quantityPerRun: 1, runsNeeded: 3 },
      inputs: [{ typeId: 99, quantity: 100, inputs: [] }],
    },
    {
      typeId: 3,
      quantity: 5,
      producedBy: { blueprintTypeId: 1003, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 98, quantity: 4, inputs: [] }],
    },
    { typeId: 4, quantity: 7, inputs: [] },
  ];
  const labels = new Map<number, TypeLabel>([
    [1, { name: 'Wolf', groupName: 'Assault Frigate', categoryName: 'Ship' }],
    [2, { name: 'Component', groupName: 'Construction Components', categoryName: 'Material' }],
    [3, { name: 'Reaction Output', groupName: 'Composite', categoryName: 'Material' }],
    [4, { name: 'Direct Raw', groupName: 'Mineral', categoryName: 'Material' }],
    [98, { name: 'Moon Goo', groupName: 'Moon Materials', categoryName: 'Material' }],
    [99, { name: 'Tritanium', groupName: 'Mineral', categoryName: 'Material' }],
  ]);
  const activityByBlueprint = new Map<number, number>([
    [1002, 1], // manufacturing
    [1003, 11], // reaction
  ]);
  return { tree, labels, activityByBlueprint };
}

function build() {
  const { tree, labels, activityByBlueprint } = fixture();
  return toBuildTree({
    tree,
    labels,
    heights: computeHeights(tree),
    activityByBlueprint,
    product: { typeId: 1, quantityPerRun: 1, activityId: 1 },
  });
}

describe('toBuildTree', () => {
  it('roots the tree at the product with its inputs nested beneath', () => {
    const { buildTree, rootHeight } = build();
    expect(buildTree).toHaveLength(1);
    const root = buildTree[0]!;
    expect(root.typeId).toBe(1);
    expect(root.quantity).toBe(1);
    expect(root.inputs.map((n) => n.typeId).sort()).toEqual([2, 3, 4]);
    expect(rootHeight).toBe(2); // one stage above its tallest input (the component / reaction at height 1)
  });

  it('multiplies quantities down by each parent run, on the marginal basis', () => {
    const root = build().buildTree[0]!;
    const byId = new Map(root.inputs.map((n) => [n.typeId, n]));
    // Component ×3, each run takes 100 minerals → 300.
    expect(byId.get(2)!.inputs[0]!.quantity).toBe(300);
    // Reaction needs 5 but yields 10/run → 0.5 runs × 4 moon goo = 2 (not a rounded-up 4).
    expect(byId.get(3)!.inputs[0]!.quantity).toBe(2);
  });

  it('labels every node from an in-game identifier — never an invented bucket', () => {
    const d = build().buildNodeDisplay;
    expect(d[1]).toMatchObject({ label: 'Assault Frigate', tone: 'teal', isRaw: false, height: 2 }); // root: its group
    expect(d[2]).toMatchObject({ label: 'Construction Components', tone: 'blue', isRaw: false }); // manufactured: SDE group
    expect(d[3]).toMatchObject({ label: 'Reaction', tone: 'purple', isRaw: false }); // activity 11
    expect(d[4]).toMatchObject({ label: 'Mineral', isRaw: true }); // raw: its real group, not a renamed bucket
    expect(d[99]).toMatchObject({ isRaw: true, height: 0 });
  });

  it('returns an empty tree when the blueprint has no resolved inputs', () => {
    const empty = toBuildTree({
      tree: [],
      labels: new Map(),
      heights: new Map(),
      activityByBlueprint: new Map(),
      product: { typeId: 1, quantityPerRun: 1, activityId: 1 },
    });
    expect(empty.buildTree).toEqual([]);
    expect(empty.rootHeight).toBe(0);
  });
});
