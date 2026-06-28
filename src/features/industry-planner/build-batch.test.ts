import { describe, expect, it } from 'vitest';
import treesFixture from '@/data/eve-data/__fixtures__/blueprint-trees.json';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import {
  chainActualsFrom,
  collectBlueprintTypeIds,
  collectRawTypeIds,
  computeBatchLedger,
  computeBatchLedgerWithMe,
  computeBatchMaterials,
  computeBatchMaterialsWithMe,
} from './build-batch';

// "Owns nothing" — every blueprint is unowned, so the ME-aware path falls back
// to ME0 everywhere. topBlueprintTypeId is irrelevant when meOf returns undefined.
const NO_OWNED = { meOf: () => undefined, topBlueprintTypeId: 0 };

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
    expect(builds.get(100)).toEqual({ runs: 1, batch: 10, me: 0 }); // ⌈5/10⌉ = 1 run, 10/run
    expect(raws.get(200)).toBe(7);
  });

  it('scales the run count by requestedRuns', () => {
    const { builds, raws } = computeBatchLedger(tree, 3);
    expect(builds.get(100)).toEqual({ runs: 2, batch: 10, me: 0 }); // ⌈15/10⌉ = 2 runs
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
    expect(ledger.builds.get(20)).toEqual({ runs: 2, batch: 40, me: 0 }); // 80 produced
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

describe('chainActualsFrom — ME-aware marginal cascade', () => {
  // Focus M (BP 110) is consumed 2× by the unresearched top blueprint, and draws
  // 100 of component F (BP 120, made 40/run) per run; F draws 1 raw G/run. With
  // M's own blueprint at ME10, M's marginal draw of F drops 10% (200 → 180), and
  // that cascades to G (5 → 4.5) — fractionally, matching the drill-down's
  // un-rounded lens. F's own ME0 adds no further reduction.
  const tree: TreeNode[] = [
    {
      typeId: 10,
      quantity: 2,
      producedBy: { blueprintTypeId: 110, quantityPerRun: 1, runsNeeded: 2 },
      inputs: [
        {
          typeId: 20,
          quantity: 100,
          producedBy: { blueprintTypeId: 120, quantityPerRun: 40, runsNeeded: 2.5 },
          inputs: [{ typeId: 30, quantity: 1, inputs: [] }],
        },
      ],
    },
  ];
  const me10 = { meOf: (bp: number) => (bp === 110 ? 10 : undefined), topBlueprintTypeId: 9000 };

  it("reduces the focused build's marginal draw by its own ME, cascading fractionally", () => {
    const actuals = chainActualsFrom(tree, 10, computeBatchLedgerWithMe(tree, 1, me10));
    expect(actuals.get(1)?.get(20)).toBeCloseTo(180, 9); // 2 runs × 100 × 0.9
    expect(actuals.get(2)?.get(30)).toBeCloseTo(4.5, 9); // (180 / 40) × 1, F is ME0
  });

  it('byte-identical to the unowned cascade when nothing is owned', () => {
    const meActuals = chainActualsFrom(tree, 10, computeBatchLedgerWithMe(tree, 1, NO_OWNED));
    const plainActuals = chainActualsFrom(tree, 10, computeBatchLedger(tree, 1));
    expect(meActuals.get(1)?.get(20)).toBe(plainActuals.get(1)?.get(20));
    expect(meActuals.get(2)?.get(30)).toBe(plainActuals.get(2)?.get(30));
    expect(plainActuals.get(1)?.get(20)).toBe(200); // ME0: 2 × 100
    expect(plainActuals.get(2)?.get(30)).toBe(5); // ME0: (200 / 40) × 1
  });
});

describe('computeBatchMaterialsWithMe — byte-identical to ME0 when nothing is owned', () => {
  // THE load-bearing guarantee: with no owned blueprints the topological ME path
  // must reproduce the incremental ME0 walk EXACTLY, so the gross seed (which
  // never passes meOf) is untouched. Proven over every committed blueprint tree
  // (incl. the Legion oracle's reactions + shared components) at several run
  // counts — not just one fixture.
  const fixtures = Object.entries(treesFixture as Record<string, TreeNode[]>);

  for (const [name, tree] of fixtures) {
    for (const runs of [1, 2, 3, 5]) {
      it(`${name} @ ${runs} run(s): ME-aware(unowned) === ME0`, () => {
        expect(asMap(computeBatchMaterialsWithMe(tree, runs, NO_OWNED))).toEqual(
          asMap(computeBatchMaterials(tree, runs)),
        );
      });
    }
  }

  it('shared sub-component still sum-then-ceils under the ME path', () => {
    const sub = (): TreeNode => ({
      typeId: 200,
      quantity: 300,
      producedBy: { blueprintTypeId: 1200, quantityPerRun: 1000, runsNeeded: 0.3 },
      inputs: [{ typeId: 300, quantity: 1, inputs: [] }],
    });
    const tree: TreeNode[] = [
      { typeId: 100, quantity: 1, producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 1 }, inputs: [sub()] },
      { typeId: 101, quantity: 1, producedBy: { blueprintTypeId: 1101, quantityPerRun: 1, runsNeeded: 1 }, inputs: [sub()] },
    ];
    expect(asMap(computeBatchMaterialsWithMe(tree, 1, NO_OWNED))).toEqual({ 300: 1 });
  });
});

describe('computeBatchMaterialsWithMe — EVE material-efficiency formula', () => {
  // A one-level build: the TOP blueprint (BP 9000) consumes raw R (typeId 1) at a
  // base quantity. The top blueprint's owned ME reduces it per the EVE formula
  //   max(runs, ceil(round(qty · runs · (1 − ME/100), 2))).
  const oneLevel = (baseQty: number): TreeNode[] => [{ typeId: 1, quantity: baseQty, inputs: [] }];
  const me10 = { meOf: (bp: number) => (bp === 9000 ? 10 : undefined), topBlueprintTypeId: 9000 };

  it('qty 1, 100 runs, ME10 → 100 (the ≥1-per-run floor, NOT 90)', () => {
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(1), 100, me10))).toEqual({ 1: 100 });
  });

  it('qty 1, 10 runs, ME10 → 10 (floored to runs)', () => {
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(1), 10, me10))).toEqual({ 1: 10 });
  });

  it('qty 200, 3 runs, ME10 → 540', () => {
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(200), 3, me10))).toEqual({ 1: 540 });
  });

  it('qty 32, 1 run, ME10 → 29 (round-then-ceil: 28.8 → 29)', () => {
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(32), 1, me10))).toEqual({ 1: 29 });
  });
});

describe('computeBatchMaterialsWithMe — aggregate-then-ceil (non-linearity guard)', () => {
  // Component C (BP 1200, ME10) is shared by two parents A and B, each driving 1
  // run of C → C runs 2× total, consuming raw I at qty 7/run. ME must be applied
  // ONCE over C's whole 2-run total: max(2, ceil(round(7·2·0.9))) = ceil(12.6) =
  // 13. An incremental per-visit ME would compute ceil(6.3)=7 twice = 14. This
  // test fails the moment the topological pass is "optimised" back to the walk.
  const child = (): TreeNode => ({
    typeId: 200,
    quantity: 1,
    producedBy: { blueprintTypeId: 1200, quantityPerRun: 1, runsNeeded: 1 },
    inputs: [{ typeId: 300, quantity: 7, inputs: [] }],
  });
  const tree: TreeNode[] = [
    { typeId: 100, quantity: 1, producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 1 }, inputs: [child()] },
    { typeId: 101, quantity: 1, producedBy: { blueprintTypeId: 1101, quantityPerRun: 1, runsNeeded: 1 }, inputs: [child()] },
  ];
  const meOf = (bp: number) => (bp === 1200 ? 10 : undefined);

  it('applies ME over the summed run total, not per shared-parent visit (13, not 14)', () => {
    expect(asMap(computeBatchMaterialsWithMe(tree, 1, { meOf, topBlueprintTypeId: 0 }))).toEqual({ 300: 13 });
  });
});

describe('computeBatchLedgerWithMe — per-layer ME independence', () => {
  // Top (BP 9000, ME10) → M (BP 9001, ME0) → D (BP 9002, ME10) → raw R. Each
  // layer must reduce by ITS OWN blueprint's ME — never a neighbour's.
  const tree: TreeNode[] = [
    {
      typeId: 10, // mid component M, top consumes 10/run
      quantity: 10,
      producedBy: { blueprintTypeId: 9001, quantityPerRun: 1, runsNeeded: 10 },
      inputs: [
        {
          typeId: 20, // deep component D, M consumes 2/run
          quantity: 2,
          producedBy: { blueprintTypeId: 9002, quantityPerRun: 1, runsNeeded: 2 },
          inputs: [{ typeId: 30, quantity: 10, inputs: [] }], // raw R, D consumes 10/run
        },
      ],
    },
  ];
  const meOf = (bp: number) => (bp === 9000 ? 10 : bp === 9002 ? 10 : bp === 9001 ? 0 : undefined);
  const opts = { meOf, topBlueprintTypeId: 9000 };

  it('top ME10 reduces M (9 runs, not 10); mid ME0 leaves D (18); deep ME10 reduces R (162)', () => {
    const ledger = computeBatchLedgerWithMe(tree, 1, opts);
    expect(ledger.builds.get(10)?.runs).toBe(9); // top ME10: max(1,ceil(9)) = 9
    expect(ledger.builds.get(20)?.runs).toBe(18); // mid ME0: 9 runs × 2 = 18
    expect(ledger.raws.get(30)).toBe(162); // deep ME10: max(18,ceil(162)) = 162
  });

  it('all-ME0 control: M 10, D 20, R 200', () => {
    const ledger = computeBatchLedgerWithMe(tree, 1, NO_OWNED);
    expect(ledger.builds.get(10)?.runs).toBe(10);
    expect(ledger.builds.get(20)?.runs).toBe(20);
    expect(ledger.raws.get(30)).toBe(200);
  });
});

describe('computeBatchLedgerWithMe — cascade + reaction ME0', () => {
  // Top (BP 9000, ME10) consumes 100 of reaction product C (BP 1200, a reaction →
  // ME0), made 30/run, consuming 1 raw R/run. Top's ME cuts C demand 100 → 90, so
  // C runs ⌈90/30⌉ = 3 (vs ⌈100/30⌉ = 4 at ME0) — the cascade. C is a reaction, so
  // it applies NO ME of its own to R: 3 runs × 1 = 3.
  const tree: TreeNode[] = [
    {
      typeId: 200,
      quantity: 100,
      producedBy: { blueprintTypeId: 1200, quantityPerRun: 30, runsNeeded: 100 / 30 },
      inputs: [{ typeId: 300, quantity: 1, inputs: [] }],
    },
  ];
  const meOf = (bp: number) => (bp === 9000 ? 10 : bp === 1200 ? 0 : undefined);
  const opts = { meOf, topBlueprintTypeId: 9000 };

  it("a parent's ME drops a child's run count (4 → 3); the reaction adds no ME", () => {
    const ledger = computeBatchLedgerWithMe(tree, 1, opts);
    expect(ledger.builds.get(200)?.runs).toBe(3);
    expect(ledger.raws.get(300)).toBe(3);
  });

  it('all-ME0 control: 4 runs, 4 raw', () => {
    const ledger = computeBatchLedgerWithMe(tree, 1, NO_OWNED);
    expect(ledger.builds.get(200)?.runs).toBe(4);
    expect(ledger.raws.get(300)).toBe(4);
  });
});

describe('collectBlueprintTypeIds', () => {
  it('returns the top blueprint plus every buildable node’s producing blueprint', () => {
    const tree: TreeNode[] = [
      {
        typeId: 100,
        quantity: 5,
        producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
        inputs: [
          {
            typeId: 200,
            quantity: 7,
            producedBy: { blueprintTypeId: 1200, quantityPerRun: 1, runsNeeded: 7 },
            inputs: [{ typeId: 300, quantity: 1, inputs: [] }],
          },
        ],
      },
      { typeId: 400, quantity: 2, inputs: [] }, // raw — no blueprint
    ];
    expect(collectBlueprintTypeIds(tree, 9000).sort((a, b) => a - b)).toEqual([1100, 1200, 9000]);
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
