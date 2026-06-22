import { describe, expect, it } from 'vitest';
import treesFixture from '@/data/eve-data/__fixtures__/blueprint-trees.json';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import {
  chainActualsFrom,
  collectRawTypeIds,
  computeBatchLedger,
  computeBatchMaterials,
} from './build-batch';

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

describe('computeBatchLedger — raws + buildable run-counts from one walk', () => {
  // Product needs 5 of X (made 10/run, 7 R/run). One walk yields both the raw
  // total AND X's whole run count + per-run yield (so the tier display can read
  // the produced batch without a second computation).
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
  ];

  it('exposes the buildable ledger and the raw totals', () => {
    const { raws, builds } = computeBatchLedger(tree, 1);
    expect(builds.get(100)).toEqual({ runs: 1, batch: 10 }); // ⌈5/10⌉ = 1 run, 10/run
    expect(raws.get(200)).toBe(7);
  });

  it('scales the run count by requestedRuns', () => {
    const { builds, raws } = computeBatchLedger(tree, 3);
    expect(builds.get(100)).toEqual({ runs: 2, batch: 10 }); // ⌈15/10⌉ = 2 runs
    expect(raws.get(200)).toBe(14);
  });

  it('agrees with computeBatchMaterials on the raw projection', () => {
    expect(asMap([...computeBatchLedger(tree, 3).raws].map(([typeId, quantity]) => ({ typeId, quantity })))).toEqual(
      asMap(computeBatchMaterials(tree, 3)),
    );
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

describe('chainActualsFrom — focused build consumes marginal, not batched', () => {
  // Reaction Y (10) needs 50 fuel blocks F (20); F is made 40/run consuming 1 raw
  // G (30) per run. The project rounds F up to ⌈50/40⌉ = 2 runs (80 produced, 2 G),
  // but the actual amount Y burns is 50 fuel blocks — and those need 1.25 F runs'
  // worth of G (1.25), not 2. Drilling into Y must show the actuals.
  const tree: TreeNode[] = [
    {
      typeId: 10,
      quantity: 1,
      producedBy: { blueprintTypeId: 110, quantityPerRun: 1, runsNeeded: 1 },
      inputs: [
        {
          typeId: 20,
          quantity: 50,
          producedBy: { blueprintTypeId: 120, quantityPerRun: 40, runsNeeded: 1.25 },
          inputs: [{ typeId: 30, quantity: 1, inputs: [] }],
        },
      ],
    },
  ];
  const ledger = computeBatchLedger(tree, 1);

  it('the project cost basis rounds fuel blocks up to whole runs', () => {
    expect(ledger.builds.get(20)).toEqual({ runs: 2, batch: 40 }); // 80 produced
    expect(ledger.raws.get(30)).toBe(2); // 2 whole F runs × 1 G
  });

  it('focusing the reaction shows the ACTUAL fuel blocks it burns (50, not 80)', () => {
    const actuals = chainActualsFrom(tree, 10, ledger);
    expect(actuals.get(1)?.get(20)).toBe(50); // direct input, relative depth 1
    expect(actuals.get(2)?.get(30)).toBeCloseTo(1.25, 9); // raw under F, marginal
  });

  it('omits the focused item itself (relative depth 0)', () => {
    expect(chainActualsFrom(tree, 10, ledger).has(0)).toBe(false);
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
