import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { computeBatchLedger } from './build-batch';
import { componentSheet } from './component-sheet-view';
import type { BlueprintStructure } from './types';

// A component (10) of two inputs: a reaction (20) of one raw (30), and a raw (40).
const tree: TreeNode[] = [
  {
    typeId: 10,
    quantity: 3,
    producedBy: { blueprintTypeId: 110, quantityPerRun: 2, runsNeeded: 1.5 },
    inputs: [
      {
        typeId: 20,
        quantity: 50,
        producedBy: { blueprintTypeId: 120, quantityPerRun: 40, runsNeeded: 1.25 },
        inputs: [{ typeId: 30, quantity: 5, inputs: [] }],
      },
      { typeId: 40, quantity: 7, inputs: [] },
    ],
  },
];
const structure = {
  tree,
  buildNodeDisplay: {
    10: { name: 'Capital Armor Plates', label: 'Capital Component', isRaw: false, height: 2, tone: 'green' },
    20: { name: 'Fernite Carbide', label: 'Reaction', isRaw: false, height: 1, tone: 'blue' },
  },
  materialNames: { 30: 'Fernite', 40: 'Tritanium' },
  nodeActivityByBlueprint: { 110: 1, 120: 11 },
} as unknown as BlueprintStructure;

const prices = new Map<number, number | null>([
  [10, 9_000],
  [20, 40],
  [30, 2],
  [40, 5],
]);

describe('componentSheet', () => {
  const ledger = computeBatchLedger(tree, 1);

  it('shows the job: whole runs, what they make, and every input at market', () => {
    const sheet = componentSheet(structure, 10, ledger, prices);
    // 3 needed at 2 a run → 2 runs making 4; each run draws 50 + 7.
    expect(sheet).toMatchObject({
      name: 'Capital Armor Plates',
      label: 'Capital Component',
      blueprintTypeId: 110,
      activityId: 1,
      runs: 2,
      batch: 2,
      required: 3,
      makes: 4,
    });
    expect(sheet!.inputs).toEqual([
      { typeId: 20, name: 'Fernite Carbide', label: 'Reaction', quantity: 100, unitPrice: 40, value: 4_000, buildable: true },
      { typeId: 40, name: 'Tritanium', label: '', quantity: 14, unitPrice: 5, value: 70, buildable: false },
    ]);
    expect(sheet!.buildCost).toBe(4_070);
    expect(sheet!.buildPerUnit).toBe(4_070 / 4);
    expect(sheet!.buyPerUnit).toBe(9_000);
  });

  it('opens a deeper job with its own runs and activity', () => {
    // 100 Fernite Carbide at 40 a run → 3 runs making 120, burning 15 Fernite.
    const sheet = componentSheet(structure, 20, ledger, prices);
    expect(sheet).toMatchObject({ activityId: 11, runs: 3, makes: 120, required: 100, buildCost: 30, buildPerUnit: 0.25 });
  });

  it('leaves the build cost open while an input is unpriced', () => {
    const sheet = componentSheet(structure, 10, ledger, new Map([[20, 40]]));
    expect(sheet!.buildCost).toBeNull();
    expect(sheet!.buildPerUnit).toBeNull();
    expect(sheet!.buyPerUnit).toBeNull();
  });

  it('is null for something the plan does not build', () => {
    expect(componentSheet(structure, 40, ledger, prices)).toBeNull();
  });
});
