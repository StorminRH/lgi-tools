import { describe, expect, it } from 'vitest';
import treesFixture from '@/data/eve-data/__fixtures__/blueprint-trees.json';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { collectRawTypeIds, computeBatchMaterials } from './build-batch';

// Helper: result list → typeId→quantity map for easy assertions.
function asMap(rows: { typeId: number; quantity: number }[]): Record<number, number> {
  return Object.fromEntries(rows.map((r) => [r.typeId, r.quantity]));
}

describe('computeBatchMaterials — batch rounding', () => {
  // Product needs 5 of intermediate X; X is made 10/run and consumes 7 of raw R
  // per run. Marginal would charge 0.5 run → 3.5 R; whole-run runs ⌈5/10⌉ = 1,
  // so the build bears a full run's 7 R (you can't run half a job).
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
  ];

  it('rounds a partial run up to a whole run', () => {
    expect(asMap(computeBatchMaterials(tree))).toEqual({ 200: 7 });
  });

  it('scales by requestedRuns, still whole-run', () => {
    // 3 product runs → 15 of X → ⌈15/10⌉ = 2 runs → 14 R.
    expect(asMap(computeBatchMaterials(tree, 3))).toEqual({ 200: 14 });
  });
});

describe('computeBatchMaterials — shared sub-component', () => {
  // Two components A and B each need 300 of shared intermediate C (made 1000/run,
  // consuming 1 raw R per run). Demand for C must be SUMMED (600) before the
  // ceil → 1 run → 1 R. A per-occurrence ceil would give ⌈300/1000⌉ × 2 = 2 runs.
  const sub = (): TreeNode => ({
    typeId: 200,
    quantity: 300,
    producedBy: { blueprintTypeId: 1200, quantityPerRun: 1000, runsNeeded: 0.3 },
    inputs: [{ typeId: 300, quantity: 1, inputs: [] }],
  });
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 1,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 1 },
      inputs: [sub()],
    },
    {
      typeId: 101,
      quantity: 1,
      producedBy: { blueprintTypeId: 1101, quantityPerRun: 1, runsNeeded: 1 },
      inputs: [sub()],
    },
  ];

  it('counts a shared component once (sum-then-ceil, no double count)', () => {
    expect(asMap(computeBatchMaterials(tree))).toEqual({ 300: 1 });
  });
});

describe('computeBatchMaterials — Legion Hull oracle (regression)', () => {
  // 1× Legion Hull (29986), ME0, empty hangar. The committed Legion tree is
  // pinned to the live SDE by `pnpm validate:resolver`, so these whole-run
  // totals are honest. Verified independently against the SDE and the operator's
  // production spreadsheet: if this fixture ever drifts, 1,000 / 2,556 are the
  // truth — reconcile, never regenerate-to-pass.
  const legion = (treesFixture as Record<string, TreeNode[]>).Legion;
  const totals = asMap(computeBatchMaterials(legion));

  it('Fullerite-C50 = 1,000 (Fulleroferrocene 2 runs × 200 + PPD 2 runs × 300)', () => {
    expect(totals[30370]).toBe(1_000);
  });

  it('Tritanium = 2,556 (Fulleroferrocene 2 runs × 1000 + R.A.M. 1 run × 556)', () => {
    expect(totals[34]).toBe(2_556);
  });
});

describe('collectRawTypeIds', () => {
  it('returns the leaf (recipe-less) type IDs only', () => {
    const tree: TreeNode[] = [
      {
        typeId: 100,
        quantity: 5,
        producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
        inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
      },
      { typeId: 300, quantity: 2, inputs: [] },
    ];
    expect(collectRawTypeIds(tree).sort((a, b) => a - b)).toEqual([200, 300]);
  });
});
