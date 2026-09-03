import { describe, expect, it } from 'vitest';
import flatMaterialsFixture from '@/data/eve-data/__fixtures__/blueprint-flat-materials.json';
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
  computeMarginalMaterials,
  computeMultibuyDemand,
} from './build-batch';

const NO_OWNED = { meOf: () => undefined, topBlueprintTypeId: 0 };

function asMap(rows: { typeId: number; quantity: number }[]): Record<number, number> {
  return Object.fromEntries(rows.map((r) => [r.typeId, r.quantity]));
}

describe('computeBatchMaterials — batch rounding', () => {
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
    expect(asMap(computeBatchMaterials(tree, 3))).toEqual({ 200: 14 });
  });
});

describe('computeBatchLedger — raws + buildable run-counts from one walk', () => {
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
    expect(builds.get(100)).toEqual({ runs: 1, batch: 10, me: 0, blueprintTypeId: 1100, required: 5 });
    expect(raws.get(200)).toBe(7);
  });

  it('scales the run count by requestedRuns', () => {
    const { builds, raws } = computeBatchLedger(tree, 3);
    expect(builds.get(100)).toEqual({ runs: 2, batch: 10, me: 0, blueprintTypeId: 1100, required: 15 });
    expect(raws.get(200)).toBe(14);
  });

  it('agrees with computeBatchMaterials on the raw projection', () => {
    expect(asMap([...computeBatchLedger(tree, 3).raws].map(([typeId, quantity]) => ({ typeId, quantity })))).toEqual(
      asMap(computeBatchMaterials(tree, 3)),
    );
  });
});

describe('computeBatchMaterials — shared sub-component', () => {
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
  const legion = (treesFixture as Record<string, TreeNode[]>).Legion!;
  const totals = asMap(computeBatchMaterials(legion));

  it('Fullerite-C50 = 1,000 (Fulleroferrocene 2 runs × 200 + PPD 2 runs × 300)', () => {
    expect(totals[30370]).toBe(1_000);
  });

  it('Tritanium = 2,556 (Fulleroferrocene 2 runs × 1000 + R.A.M. 1 run × 556)', () => {
    expect(totals[34]).toBe(2_556);
  });
});

describe('chainActualsFrom — focused build consumes marginal, not batched', () => {
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
    expect(ledger.builds.get(20)).toEqual({ runs: 2, batch: 40, me: 0, blueprintTypeId: 120, required: 50 });
    expect(ledger.raws.get(30)).toBe(2);
  });

  it('focusing the reaction shows the ACTUAL fuel blocks it burns (50, not 80)', () => {
    const actuals = chainActualsFrom(tree, 10, ledger);
    expect(actuals.get(1)?.get(20)).toBe(50);
    expect(actuals.get(2)?.get(30)).toBeCloseTo(1.25, 9);
  });

  it('omits the focused item itself (relative depth 0)', () => {
    expect(chainActualsFrom(tree, 10, ledger).has(0)).toBe(false);
  });
});

describe('chainActualsFrom — ME-aware marginal cascade', () => {
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
    expect(actuals.get(1)?.get(20)).toBeCloseTo(180, 9);
    expect(actuals.get(2)?.get(30)).toBeCloseTo(4.5, 9);
  });

  it('byte-identical to the unowned cascade when nothing is owned', () => {
    const meActuals = chainActualsFrom(tree, 10, computeBatchLedgerWithMe(tree, 1, NO_OWNED));
    const plainActuals = chainActualsFrom(tree, 10, computeBatchLedger(tree, 1));
    expect(meActuals.get(1)?.get(20)).toBe(plainActuals.get(1)?.get(20));
    expect(meActuals.get(2)?.get(30)).toBe(plainActuals.get(2)?.get(30));
    expect(plainActuals.get(1)?.get(20)).toBe(200);
    expect(plainActuals.get(2)?.get(30)).toBe(5);
  });
});

describe('computeBatchMaterialsWithMe — byte-identical to ME0 when nothing is owned', () => {
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
  const tree: TreeNode[] = [
    {
      typeId: 10,
      quantity: 10,
      producedBy: { blueprintTypeId: 9001, quantityPerRun: 1, runsNeeded: 10 },
      inputs: [
        {
          typeId: 20,
          quantity: 2,
          producedBy: { blueprintTypeId: 9002, quantityPerRun: 1, runsNeeded: 2 },
          inputs: [{ typeId: 30, quantity: 10, inputs: [] }],
        },
      ],
    },
  ];
  const meOf = (bp: number) => (bp === 9000 ? 10 : bp === 9002 ? 10 : bp === 9001 ? 0 : undefined);
  const opts = { meOf, topBlueprintTypeId: 9000 };

  it('top ME10 reduces M (9 runs, not 10); mid ME0 leaves D (18); deep ME10 reduces R (162)', () => {
    const ledger = computeBatchLedgerWithMe(tree, 1, opts);
    expect(ledger.builds.get(10)?.runs).toBe(9);
    expect(ledger.builds.get(20)?.runs).toBe(18);
    expect(ledger.raws.get(30)).toBe(162);
  });

  it('all-ME0 control: M 10, D 20, R 200', () => {
    const ledger = computeBatchLedgerWithMe(tree, 1, NO_OWNED);
    expect(ledger.builds.get(10)?.runs).toBe(10);
    expect(ledger.builds.get(20)?.runs).toBe(20);
    expect(ledger.raws.get(30)).toBe(200);
  });
});

describe('computeBatchLedgerWithMe — cascade + reaction ME0', () => {
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

describe('computeBatchLedgerWithMe — structure material factor (3.7.9.1.3)', () => {
  const oneLevel = (baseQty: number): TreeNode[] => [{ typeId: 1, quantity: baseQty, inputs: [] }];
  const noBpMe = (mult: number) => ({
    meOf: () => undefined,
    topBlueprintTypeId: 9000,
    structureMeFactorOf: () => mult,
  });

  it('reduces a node by the structure factor, rounded once', () => {
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(200), 1, noBpMe(0.95)))).toEqual({ 1: 190 });
  });

  it('composes blueprint ME and the structure as ONE round (no double-ceil)', () => {
    const opts = {
      meOf: (bp: number) => (bp === 9000 ? 1 : undefined),
      topBlueprintTypeId: 9000,
      structureMeFactorOf: () => 0.99,
    };
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(199), 1, opts))).toEqual({ 1: 196 });
  });

  it('honours the ≥1-per-run floor under a structure factor', () => {
    expect(asMap(computeBatchMaterialsWithMe(oneLevel(1), 100, noBpMe(0.95)))).toEqual({ 1: 100 });
  });

  it('byte-identical to the no-structure basis when the factor is 1 everywhere', () => {
    const tree = oneLevel(200);
    expect(asMap(computeBatchMaterialsWithMe(tree, 3, noBpMe(1)))).toEqual(
      asMap(computeBatchMaterials(tree, 3)),
    );
  });

  it('applies per node — a reaction child kept at factor 1 draws its raws unreduced', () => {
    const tree: TreeNode[] = [
      {
        typeId: 200,
        quantity: 100,
        producedBy: { blueprintTypeId: 1200, quantityPerRun: 30, runsNeeded: 100 / 30 },
        inputs: [{ typeId: 300, quantity: 1, inputs: [] }],
      },
    ];
    const ledger = computeBatchLedgerWithMe(tree, 1, {
      meOf: () => undefined,
      topBlueprintTypeId: 9000,
      structureMeFactorOf: (bp: number) => (bp === 9000 ? 0.95 : 1),
    });
    expect(ledger.builds.get(200)?.runs).toBe(4);
    expect(ledger.raws.get(300)).toBe(4);
  });
});

describe('computeMarginalMaterials — fractional (Item) basis', () => {
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
  ];

  it('charges the fraction of a run consumed — no ceil, no ≥1-per-run floor', () => {
    expect(asMap(computeMarginalMaterials(tree))).toEqual({ 200: 3.5 });
  });

  it('is linear in requestedRuns (3 runs = exactly 3× one run)', () => {
    expect(asMap(computeMarginalMaterials(tree, 3))).toEqual({ 200: 10.5 });
  });

  it('sums shared-component demand once (no double count)', () => {
    const sub = (): TreeNode => ({
      typeId: 200,
      quantity: 300,
      producedBy: { blueprintTypeId: 1200, quantityPerRun: 1000, runsNeeded: 0.3 },
      inputs: [{ typeId: 300, quantity: 1, inputs: [] }],
    });
    const shared: TreeNode[] = [
      { typeId: 100, quantity: 1, producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 1 }, inputs: [sub()] },
      { typeId: 101, quantity: 1, producedBy: { blueprintTypeId: 1101, quantityPerRun: 1, runsNeeded: 1 }, inputs: [sub()] },
    ];
    expect(asMap(computeMarginalMaterials(shared))).toEqual({ 300: 0.6 });
  });

  it('applies owned ME as a LINEAR factor (no floor: 100 runs × qty 1 @ ME10 → 90)', () => {
    const oneLevel: TreeNode[] = [{ typeId: 1, quantity: 1, inputs: [] }];
    const me10 = { meOf: (bp: number) => (bp === 9000 ? 10 : undefined), topBlueprintTypeId: 9000 };
    expect(asMap(computeMarginalMaterials(oneLevel, 100, me10))).toEqual({ 1: 90 });
  });

  it('cascades a parent’s ME fractionally to its children', () => {
    const me10 = { meOf: (bp: number) => (bp === 9000 ? 10 : undefined), topBlueprintTypeId: 9000 };
    const only = computeMarginalMaterials(tree, 1, me10)[0]!;
    expect(only.typeId).toBe(200);
    expect(only.quantity).toBeCloseTo(3.15, 9);
  });

  it('composes the structure factor linearly with ME', () => {
    const oneLevel: TreeNode[] = [{ typeId: 1, quantity: 200, inputs: [] }];
    const opts = {
      meOf: (bp: number) => (bp === 9000 ? 10 : undefined),
      topBlueprintTypeId: 9000,
      structureMeFactorOf: () => 0.95,
    };
    const only = computeMarginalMaterials(oneLevel, 1, opts)[0]!;
    expect(only.quantity).toBeCloseTo(171, 9);
  });

  it('unowned / reaction nodes (ME ≤ 0) get factor ×1 — identical to no opts', () => {
    expect(asMap(computeMarginalMaterials(tree, 1, { meOf: () => 0, topBlueprintTypeId: 9000 }))).toEqual(
      asMap(computeMarginalMaterials(tree, 1)),
    );
  });
});

describe('computeMarginalMaterials — resolver flat-materials cross-check', () => {
  const flat = flatMaterialsFixture as unknown as Record<
    string,
    { blueprintTypeId: number; outputTypeId: number; materials: Record<string, number> }
  >;
  const names = ['Rifter', 'Drake', 'Archon', 'Legion'] as const;

  for (const name of names) {
    it(`${name}: client marginal walk === resolver flat materials (±1, rounds-to-0 tolerant)`, () => {
      const tree = (treesFixture as Record<string, TreeNode[]>)[name]!;
      const expected = flat[name]!.materials;
      const computed = computeMarginalMaterials(tree, 1);
      for (const { typeId, quantity } of computed) {
        const pinned = expected[String(typeId)];
        if (pinned === undefined) {
          expect(Math.round(quantity), `type ${typeId} missing from fixture`).toBe(0);
        } else {
          expect(Math.abs(Math.round(quantity) - pinned), `type ${typeId}`).toBeLessThanOrEqual(1);
        }
      }
      const computedIds = new Set(computed.map((m) => m.typeId));
      for (const key of Object.keys(expected)) {
        expect(computedIds.has(Number(key)), `fixture type ${key} absent from walk`).toBe(true);
      }
    });
  }

  it('Legion: marginal Tritanium ≈ 1,766 where the batched basis bears 2,556', () => {
    const legion = (treesFixture as Record<string, TreeNode[]>).Legion!;
    const marginal = asMap(computeMarginalMaterials(legion));
    expect(Math.round(marginal[34]!)).toBe(1_766);
    expect(asMap(computeBatchMaterials(legion))[34]).toBe(2_556);
  });
});

describe('BatchLedger.required — surplus identity', () => {
  const fixtures = Object.entries(treesFixture as Record<string, TreeNode[]>);

  for (const [name, tree] of fixtures) {
    it(`${name}: produced ≥ required > 0 for every buildable (both ledgers)`, () => {
      for (const ledger of [computeBatchLedger(tree, 1), computeBatchLedgerWithMe(tree, 1, NO_OWNED)]) {
        for (const [typeId, b] of ledger.builds) {
          expect(b.required, `type ${typeId} required`).toBeGreaterThan(0);
          expect(b.runs * b.batch, `type ${typeId} produced`).toBeGreaterThanOrEqual(b.required);
        }
      }
    });
  }
});

describe('computeMultibuyDemand — build-everything equivalence (the reuse pin)', () => {
  const fixtures = Object.entries(treesFixture as Record<string, TreeNode[]>);
  const flat = flatMaterialsFixture as unknown as Record<string, { blueprintTypeId: number }>;

  for (const [name, tree] of fixtures) {
    for (const runs of [1, 2, 3, 5]) {
      it(`${name} @ ${runs} run(s): all-build, no owned ≡ computeBatchLedgerWithMe.raws`, () => {
        const meVariants = [
          NO_OWNED,
          { meOf: (bp: number) => bp % 11, topBlueprintTypeId: flat[name]!.blueprintTypeId },
        ];
        for (const opts of meVariants) {
          const ledger = computeBatchLedgerWithMe(tree, runs, opts);
          const buy = computeMultibuyDemand(tree, runs, opts, {
            buildSet: new Set(ledger.builds.keys()),
          });
          expect(buy).toEqual(ledger.raws);
        }
      });
    }
  }

  it('every emitted quantity is an integer, across all fixtures and run counts', () => {
    for (const [, tree] of fixtures) {
      for (const runs of [1, 2, 3, 5]) {
        const ledger = computeBatchLedgerWithMe(tree, runs, NO_OWNED);
        const buy = computeMultibuyDemand(tree, runs, NO_OWNED, {
          buildSet: new Set(ledger.builds.keys()),
        });
        for (const [typeId, qty] of buy) {
          expect(Number.isInteger(qty), `type ${typeId} @ ${runs} run(s)`).toBe(true);
        }
      }
    }
  });

  it('omitting ownedOf is identical to ownedOf that returns 0 (one code path)', () => {
    const legion = (treesFixture as Record<string, TreeNode[]>).Legion!;
    const buildSet = new Set(computeBatchLedgerWithMe(legion, 1, NO_OWNED).builds.keys());
    expect(computeMultibuyDemand(legion, 1, NO_OWNED, { buildSet })).toEqual(
      computeMultibuyDemand(legion, 1, NO_OWNED, { buildSet, ownedOf: () => 0 }),
    );
  });
});

describe('computeMultibuyDemand — bought intermediates terminate the cascade (MECE)', () => {
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
  ];

  it('building X buys the raw frontier', () => {
    expect(computeMultibuyDemand(tree, 1, NO_OWNED, { buildSet: new Set([100]) })).toEqual(
      new Map([[200, 7]]),
    );
  });

  it('buying X lists X at its demand and none of its inputs', () => {
    expect(computeMultibuyDemand(tree, 1, NO_OWNED, { buildSet: new Set() })).toEqual(
      new Map([[100, 5]]),
    );
  });

  it('a checked type nothing demands drops out (bought parent starves it)', () => {
    const nested: TreeNode[] = [
      {
        typeId: 100,
        quantity: 2,
        producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 2 },
        inputs: [
          {
            typeId: 200,
            quantity: 300,
            producedBy: { blueprintTypeId: 1200, quantityPerRun: 10, runsNeeded: 60 },
            inputs: [{ typeId: 300, quantity: 7, inputs: [] }],
          },
        ],
      },
    ];
    expect(computeMultibuyDemand(nested, 1, NO_OWNED, { buildSet: new Set([200]) })).toEqual(
      new Map([[100, 2]]),
    );
  });
});

describe('computeMultibuyDemand — multi-depth demand aggregates once', () => {
  const c = (qty: number): TreeNode => ({
    typeId: 200,
    quantity: qty,
    producedBy: { blueprintTypeId: 1200, quantityPerRun: 10, runsNeeded: qty / 10 },
    inputs: [{ typeId: 300, quantity: 7, inputs: [] }],
  });
  const tree: TreeNode[] = [
    c(5),
    {
      typeId: 100,
      quantity: 2,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 1, runsNeeded: 2 },
      inputs: [c(300)],
    },
  ];

  it('bought C is one line at the cross-depth sum (605), inputs absent', () => {
    expect(computeMultibuyDemand(tree, 1, NO_OWNED, { buildSet: new Set([100]) })).toEqual(
      new Map([[200, 605]]),
    );
  });

  it('built C sum-then-ceils across depths (61 runs → 427 R)', () => {
    expect(computeMultibuyDemand(tree, 1, NO_OWNED, { buildSet: new Set([100, 200]) })).toEqual(
      new Map([[300, 427]]),
    );
  });
});

describe('computeMultibuyDemand — Archon fuel blocks (real multi-depth pin)', () => {
  const archon = (treesFixture as Record<string, TreeNode[]>).Archon!;
  const base = computeBatchLedgerWithMe(archon, 1, NO_OWNED);
  const FUEL_BLOCK = 4247;

  it('bought fuel blocks are one aggregated line; the frontier never grows', () => {
    expect(base.builds.has(FUEL_BLOCK)).toBe(true);
    const buildSet = new Set(base.builds.keys());
    buildSet.delete(FUEL_BLOCK);
    const buy = computeMultibuyDemand(archon, 1, NO_OWNED, { buildSet });
    expect(buy.get(FUEL_BLOCK)).toBe(base.builds.get(FUEL_BLOCK)!.required);
    for (const [typeId, qty] of buy) {
      if (typeId === FUEL_BLOCK) continue;
      expect(qty, `raw ${typeId}`).toBeLessThanOrEqual(base.raws.get(typeId) ?? 0);
    }
    const shrank = [...base.raws].some(([typeId, qty]) => (buy.get(typeId) ?? 0) < qty);
    expect(shrank).toBe(true);
  });
});

describe('computeMultibuyDemand — Remaining (owned subtraction, one code path)', () => {
  const tree: TreeNode[] = [
    {
      typeId: 100,
      quantity: 5,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 200, quantity: 7, inputs: [] }],
    },
  ];
  const all = { buildSet: new Set([100]) };

  it('an owned intermediate reduces its runs THROUGH the ceil (7 owned: 2 → 1 run)', () => {
    const buy = computeMultibuyDemand(tree, 3, NO_OWNED, {
      ...all,
      ownedOf: (id) => (id === 100 ? 7 : 0),
    });
    expect(buy).toEqual(new Map([[200, 7]]));
  });

  it('owned ≥ demand: the intermediate vanishes AND no demand reaches its inputs', () => {
    const buy = computeMultibuyDemand(tree, 3, NO_OWNED, {
      ...all,
      ownedOf: (id) => (id === 100 ? 15 : 0),
    });
    expect(buy).toEqual(new Map());
  });

  it('an owned BOUGHT intermediate nets its line (5 needed, 2 owned → buy 3)', () => {
    const buy = computeMultibuyDemand(tree, 1, NO_OWNED, {
      buildSet: new Set(),
      ownedOf: (id) => (id === 100 ? 2 : 0),
    });
    expect(buy).toEqual(new Map([[100, 3]]));
  });

  it('owned raws net and clamp at 0 (the line drops out, never negative)', () => {
    expect(
      computeMultibuyDemand(tree, 1, NO_OWNED, { ...all, ownedOf: (id) => (id === 200 ? 3 : 0) }),
    ).toEqual(new Map([[200, 4]]));
    expect(
      computeMultibuyDemand(tree, 1, NO_OWNED, { ...all, ownedOf: (id) => (id === 200 ? 999 : 0) }),
    ).toEqual(new Map());
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
      { typeId: 400, quantity: 2, inputs: [] },
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
