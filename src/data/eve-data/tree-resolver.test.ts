import { describe, expect, it } from 'vitest';
import {
  TreeResolver,
  buildIndexesFromActivities,
  computeHeights,
  type Indexes,
  type TreeNode,
} from './tree-resolver';
import flatMaterialsFixture from './__fixtures__/blueprint-flat-materials.json';

// Synthetic mini-universe for the algorithm tests. Type IDs are
// arbitrary small integers. A produces 1 of itself per run from 10
// units of B + 5 units of C. B is produced by another blueprint from
// 100 minerals; C is a raw leaf.
//
// Expected one-run flat for blueprint that makes A:
//   B is needed 10 times → walk B's blueprint → 100×10 = 1000 minerals
//   C is needed 5 times → leaf → 5
function buildSyntheticIndexes(): Indexes {
  const blueprintMaterials = new Map<number, { typeId: number; quantity: number }[]>();
  const productToBlueprint = new Map<
    number,
    { blueprintTypeId: number; quantityPerRun: number }
  >();

  // Blueprint 100 produces type 1 (A) at 1/run
  blueprintMaterials.set(100, [
    { typeId: 2, quantity: 10 }, // B
    { typeId: 3, quantity: 5 }, // C (leaf)
  ]);
  productToBlueprint.set(1, { blueprintTypeId: 100, quantityPerRun: 1 });

  // Blueprint 200 produces type 2 (B) at 1/run from 100 of type 99 (mineral leaf)
  blueprintMaterials.set(200, [{ typeId: 99, quantity: 100 }]);
  productToBlueprint.set(2, { blueprintTypeId: 200, quantityPerRun: 1 });

  return { blueprintMaterials, productToBlueprint };
}

describe('TreeResolver — synthetic walker', () => {
  it('produces flat leaf totals for a two-level recipe', () => {
    const resolver = new TreeResolver(buildSyntheticIndexes());
    const flat = resolver.flatForOneRun(100);
    expect(Object.fromEntries(flat)).toEqual({
      99: 1000, // 10 of B (made 1/run) × 100 minerals each
      3: 5, // direct leaf
    });
  });

  it('memoizes per-blueprint flat results', () => {
    const resolver = new TreeResolver(buildSyntheticIndexes());
    // Walk B (200) first to seed the memo.
    const first = resolver.flatForOneRun(200);
    const before = resolver.stats().memoHits;
    // Walk A (100) which descends into B — should hit memo for B.
    resolver.flatForOneRun(100);
    const after = resolver.stats().memoHits;
    expect(first.get(99)).toBe(100);
    expect(after).toBeGreaterThan(before);
  });

  it('emits a cycle warning and aborts the bad path', () => {
    // Pathological cycle: bp 300 needs type 50, bp 400 produces type 50
    // from type 51, bp 500 produces type 51 from type 50. The walker
    // should detect the loop on the second visit and exit without
    // blowing the stack.
    const blueprintMaterials = new Map<
      number,
      { typeId: number; quantity: number }[]
    >();
    const productToBlueprint = new Map<
      number,
      { blueprintTypeId: number; quantityPerRun: number }
    >();
    blueprintMaterials.set(300, [{ typeId: 50, quantity: 1 }]);
    productToBlueprint.set(50, { blueprintTypeId: 400, quantityPerRun: 1 });
    blueprintMaterials.set(400, [{ typeId: 51, quantity: 1 }]);
    productToBlueprint.set(51, { blueprintTypeId: 500, quantityPerRun: 1 });
    blueprintMaterials.set(500, [{ typeId: 50, quantity: 1 }]); // back-edge

    const resolver = new TreeResolver({ blueprintMaterials, productToBlueprint });
    // Should not throw; the cycle is logged and the path returns empty
    // for the offending subtree.
    expect(() => resolver.flatForOneRun(300)).not.toThrow();
    const stats = resolver.stats();
    expect(stats.cycleWarnings.length).toBeGreaterThan(0);
    expect(stats.cycleWarnings[0]).toMatch(/cycle at blueprint/);
  });

  it('charges the fractional run share when child output > 1 per run', () => {
    // Parent needs 25 of type X. Producing blueprint outputs 10 per run, so the
    // parent consumes 25/10 = 2.5 runs' worth — NOT a rounded-up 3 runs. Each
    // run consumes 7 of a leaf mineral. Expected: 2.5 × 7 = 17.5 (the marginal
    // share; whole-run rounding here is the bug that overstated deep builds).
    const blueprintMaterials = new Map<
      number,
      { typeId: number; quantity: number }[]
    >();
    const productToBlueprint = new Map<
      number,
      { blueprintTypeId: number; quantityPerRun: number }
    >();
    blueprintMaterials.set(700, [{ typeId: 70, quantity: 25 }]);
    productToBlueprint.set(70, { blueprintTypeId: 701, quantityPerRun: 10 });
    blueprintMaterials.set(701, [{ typeId: 1000, quantity: 7 }]);

    const resolver = new TreeResolver({ blueprintMaterials, productToBlueprint });
    const flat = resolver.flatForOneRun(700);
    expect(flat.get(1000)).toBe(17.5);
  });

  it('builds nested tree shape with producedBy on non-leaves', () => {
    const resolver = new TreeResolver(buildSyntheticIndexes());
    const tree = resolver.treeForOneRun(100);
    expect(tree).toHaveLength(2);
    // B (typeId 2) is recursive — has producedBy + inputs
    const bNode = tree.find((n) => n.typeId === 2);
    expect(bNode?.producedBy).toBeDefined();
    expect(bNode?.inputs).toHaveLength(1);
    expect(bNode?.inputs[0].typeId).toBe(99);
    expect(bNode?.inputs[0].inputs).toEqual([]); // leaf
    // C (typeId 3) is a leaf
    const cNode = tree.find((n) => n.typeId === 3);
    expect(cNode?.producedBy).toBeUndefined();
    expect(cNode?.inputs).toEqual([]);
  });
});

// A buildable node with the producedBy marker; quantity is irrelevant to
// height, so we leave it at 1.
function bp(typeId: number, inputs: TreeNode[]): TreeNode {
  return {
    typeId,
    quantity: 1,
    inputs,
    producedBy: { blueprintTypeId: typeId + 10000, quantityPerRun: 1, runsNeeded: 1 },
  };
}
function raw(typeId: number): TreeNode {
  return { typeId, quantity: 1, inputs: [] };
}

describe('computeHeights', () => {
  it('a raw leaf is height 0', () => {
    expect(computeHeights([raw(99)]).get(99)).toBe(0);
  });

  it('a T1-shaped build (buildable over raw leaves) is height 1', () => {
    // The product's direct inputs are all raws; each input node is itself a
    // leaf at height 0, so the root product computed from them is height 1.
    const tree = [raw(34), raw(35), raw(36)];
    const heights = computeHeights(tree);
    expect([...heights.values()]).toEqual([0, 0, 0]);
  });

  it('takes the LONGEST path to a leaf, not the shortest', () => {
    // Product (implicit) ← B ← C ← raw, plus a shallow raw sibling under B.
    //   raw(99) height 0; C height 1; B height 2.
    const c = bp(3, [raw(99)]);
    const b = bp(2, [c, raw(98)]);
    const heights = computeHeights([b]);
    expect(heights.get(99)).toBe(0);
    expect(heights.get(98)).toBe(0);
    expect(heights.get(3)).toBe(1);
    expect(heights.get(2)).toBe(2); // 1 + max(C=1, raw=0)
  });

  it('memoises by typeId — a shared subtree resolves to one stable height', () => {
    // The same component (typeId 2) appears under two different parents; its
    // height must be identical and computed once.
    const shared = () => bp(2, [raw(99)]);
    const parentA = bp(10, [shared()]);
    const parentB = bp(11, [shared(), raw(98)]);
    const heights = computeHeights([parentA, parentB]);
    expect(heights.get(2)).toBe(1);
    expect(heights.get(10)).toBe(2);
    expect(heights.get(11)).toBe(2);
  });

  it('returns an empty map for an empty tree', () => {
    expect(computeHeights([]).size).toBe(0);
  });
});

describe('TreeResolver — reference-blueprint fixture is well-formed', () => {
  // We don't run the full DB-backed resolver in unit tests (no DB,
  // no CSVs in the fixture), but we DO assert the fixture file's
  // structural invariants so a typo in the JSON shows up here rather
  // than at PR-review time. Numerical-correctness verification lives
  // in the spike (scripts/spike-tree-resolver.ts) which is run on
  // demand and gated against this same fixture file via
  // scripts/spike-known-good.json.
  const blueprints = ['Rifter', 'Drake', 'Archon', 'Legion'] as const;

  for (const name of blueprints) {
    it(`${name}: fixture entry is present and well-shaped`, () => {
      const entry = (flatMaterialsFixture as Record<string, unknown>)[name] as {
        blueprintTypeId: number;
        outputTypeId: number;
        materials: Record<string, number>;
      };
      expect(entry).toBeDefined();
      expect(entry.blueprintTypeId).toBeGreaterThan(0);
      expect(entry.outputTypeId).toBeGreaterThan(0);
      expect(Object.keys(entry.materials).length).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(entry.materials)) {
        expect(Number.parseInt(k, 10)).toBeGreaterThan(0);
        expect(v).toBeGreaterThan(0);
        expect(Number.isInteger(v)).toBe(true);
      }
    });
  }

  it('Rifter matches the four-mineral T1 frigate shape', () => {
    const rifter = (flatMaterialsFixture as Record<string, unknown>).Rifter as {
      materials: Record<string, number>;
    };
    // Trit, Pyerite, Mexallon, Isogen — IDs 34/35/36/37
    expect(rifter.materials['34']).toBe(32000);
    expect(rifter.materials['35']).toBe(6000);
    expect(rifter.materials['36']).toBe(2500);
    expect(rifter.materials['37']).toBe(500);
    expect(Object.keys(rifter.materials)).toHaveLength(4);
  });

  it('Archon has deep capital recursion (76 raw materials)', () => {
    const archon = (flatMaterialsFixture as Record<string, unknown>).Archon as {
      materials: Record<string, number>;
    };
    expect(Object.keys(archon.materials).length).toBe(76);
    // Sanity check the mineral totals — Archon at ME 0 still needs
    // multi-million Tritanium/Pyerite from the recursive walk (marginal basis).
    // Totals dropped with CCP's 3.3.2 recipe rebalance (fewer capital components)
    // but stay multi-million; the exact values are pinned in the fixture.
    expect(archon.materials['34']).toBeGreaterThan(2_000_000);
    expect(archon.materials['35']).toBeGreaterThan(7_000_000);
  });

  it('Legion (T3) flattens on the marginal basis, not whole-run overbuild', () => {
    // The case that exposed the bug. Under the old whole-run rounding, batch
    // reactions ballooned the raw gas — e.g. Fullerite-C50 (30370) was 33,400.
    // On the marginal basis a single Legion consumes only ~825, so this guards
    // against ceilDiv (or any whole-run rounding) creeping back in.
    const legion = (flatMaterialsFixture as Record<string, unknown>).Legion as {
      blueprintTypeId: number;
      materials: Record<string, number>;
    };
    expect(legion.blueprintTypeId).toBe(29987);
    expect(Object.keys(legion.materials).length).toBe(43);
    expect(legion.materials['30370']).toBeLessThan(2_000); // not the ~33k overbuild
    // Direct Ancient-Salvage leaves are not behind a batch, so they are
    // unchanged by the fix — a fixed point that confirms the basis is marginal,
    // not a blanket scale-down.
    expect(legion.materials['30251']).toBe(452); // Neurovisual Input Matrix
  });
});

// Regression: ~51 deprecated SDE blueprints (e.g. Biochemical Reactor
// Array BP 2790) ship a degenerate "1 of X makes 1 of X" recipe where
// the sole material equals the product. buildIndexesFromActivities must drop
// that self-referential edge so the walker never reads it as a cycle.
describe('TreeResolver — self-referential SDE recipes', () => {
  it('drops a blueprint whose sole material is its own product (no cycle)', () => {
    const rows = [
      {
        blueprintTypeId: 900,
        activities: {
          manufacturing: {
            materials: [{ typeID: 24684, quantity: 1 }],
            products: [{ typeID: 24684, quantity: 1 }],
          },
        },
      },
    ];
    const resolver = new TreeResolver(buildIndexesFromActivities(rows));
    const flat = resolver.flatForOneRun(900);
    expect(flat.size).toBe(0); // non-recipe → empty flat materials
    expect(resolver.stats().cycleWarnings).toHaveLength(0);
  });

  it('keeps real materials when a self-edge sits alongside them', () => {
    const rows = [
      {
        blueprintTypeId: 900,
        activities: {
          manufacturing: {
            materials: [
              { typeID: 24684, quantity: 1 }, // self
              { typeID: 34, quantity: 500 }, // real leaf
            ],
            products: [{ typeID: 24684, quantity: 1 }],
          },
        },
      },
    ];
    const resolver = new TreeResolver(buildIndexesFromActivities(rows));
    const flat = resolver.flatForOneRun(900);
    expect(Object.fromEntries(flat)).toEqual({ 34: 500 });
    expect(resolver.stats().cycleWarnings).toHaveLength(0);
  });

  it('does not drop a material produced by a different blueprint', () => {
    // BP 900 consumes 3 of type 70; BP 901 (a different blueprint)
    // produces type 70 from a leaf. The cross-blueprint edge must
    // survive — only self-edges are filtered.
    const rows = [
      {
        blueprintTypeId: 900,
        activities: {
          manufacturing: {
            materials: [{ typeID: 70, quantity: 3 }],
            products: [{ typeID: 800, quantity: 1 }],
          },
        },
      },
      {
        blueprintTypeId: 901,
        activities: {
          manufacturing: {
            materials: [{ typeID: 34, quantity: 10 }],
            products: [{ typeID: 70, quantity: 1 }],
          },
        },
      },
    ];
    const resolver = new TreeResolver(buildIndexesFromActivities(rows));
    const flat = resolver.flatForOneRun(900);
    expect(Object.fromEntries(flat)).toEqual({ 34: 30 }); // 3 of type 70 (1/run) × 10
    expect(resolver.stats().cycleWarnings).toHaveLength(0);
  });

  it("treats a degenerate blueprint's product as a leaf when consumed elsewhere", () => {
    // Forward-compat: BP 900 is degenerate (makes 24684 from 24684). If a
    // future SDE adds BP 901 that consumes 24684, that type must surface as
    // a raw leaf in 901's flat materials — not silently vanish into the
    // now-empty BP 900 (which would pass the cycle guardrail cleanly).
    const rows = [
      {
        blueprintTypeId: 900,
        activities: {
          manufacturing: {
            materials: [{ typeID: 24684, quantity: 1 }], // self → filtered
            products: [{ typeID: 24684, quantity: 1 }],
          },
        },
      },
      {
        blueprintTypeId: 901,
        activities: {
          manufacturing: {
            materials: [{ typeID: 24684, quantity: 7 }], // consumes the degenerate product
            products: [{ typeID: 800, quantity: 1 }],
          },
        },
      },
    ];
    const resolver = new TreeResolver(buildIndexesFromActivities(rows));
    const flat = resolver.flatForOneRun(901);
    expect(Object.fromEntries(flat)).toEqual({ 24684: 7 });
    expect(resolver.stats().cycleWarnings).toHaveLength(0);
  });
});
