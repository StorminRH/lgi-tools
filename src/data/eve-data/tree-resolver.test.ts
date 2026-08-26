import { describe, expect, it } from 'vitest';
import {
  TreeResolver,
  assertNoResolverCycles,
  buildIndexesFromActivities,
  computeHeights,
  hashGateSkips,
  hashResolverInputs,
  makeBatchInserter,
  pickBuildTimeSeconds,
  roundedFlatRows,
  type Indexes,
  type TreeNode,
} from './tree-resolver';
import flatMaterialsFixture from './__fixtures__/blueprint-flat-materials.json';

function buildSyntheticIndexes(): Indexes {
  const blueprintMaterials = new Map<number, { typeId: number; quantity: number }[]>();
  const productToBlueprint = new Map<
    number,
    { blueprintTypeId: number; quantityPerRun: number }
  >();

  blueprintMaterials.set(100, [
    { typeId: 2, quantity: 10 },
    { typeId: 3, quantity: 5 },
  ]);
  productToBlueprint.set(1, { blueprintTypeId: 100, quantityPerRun: 1 });

  blueprintMaterials.set(200, [{ typeId: 99, quantity: 100 }]);
  productToBlueprint.set(2, { blueprintTypeId: 200, quantityPerRun: 1 });

  return { blueprintMaterials, productToBlueprint };
}

describe('TreeResolver — synthetic walker', () => {
  it('produces flat leaf totals for a two-level recipe', () => {
    const resolver = new TreeResolver(buildSyntheticIndexes());
    const flat = resolver.flatForOneRun(100);
    expect(Object.fromEntries(flat)).toEqual({
      99: 1000,
      3: 5,
    });
  });

  it('memoizes per-blueprint flat results', () => {
    const resolver = new TreeResolver(buildSyntheticIndexes());

    const first = resolver.flatForOneRun(200);
    const before = resolver.stats().memoHits;

    resolver.flatForOneRun(100);
    const after = resolver.stats().memoHits;
    expect(first.get(99)).toBe(100);
    expect(after).toBeGreaterThan(before);
  });

  it('emits a cycle warning and aborts the bad path', () => {

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
    blueprintMaterials.set(500, [{ typeId: 50, quantity: 1 }]);

    const resolver = new TreeResolver({ blueprintMaterials, productToBlueprint });

    expect(() => resolver.flatForOneRun(300)).not.toThrow();
    const stats = resolver.stats();
    expect(stats.cycleWarnings.length).toBeGreaterThan(0);
    expect(stats.cycleWarnings[0]).toMatch(/cycle at blueprint/);
  });

  it('charges the fractional run share when child output > 1 per run', () => {

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

    const bNode = tree.find((n) => n.typeId === 2);
    expect(bNode?.producedBy).toBeDefined();
    expect(bNode?.inputs).toHaveLength(1);
    expect(bNode?.inputs[0]!.typeId).toBe(99);
    expect(bNode?.inputs[0]!.inputs).toEqual([]);

    const cNode = tree.find((n) => n.typeId === 3);
    expect(cNode?.producedBy).toBeUndefined();
    expect(cNode?.inputs).toEqual([]);
  });
});

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
  it('raw leaves sit at height 0 and empty trees stay empty', () => {
    expect(computeHeights([raw(99)]).get(99)).toBe(0);
    expect([...computeHeights([raw(34), raw(35), raw(36)]).values()]).toEqual([0, 0, 0]);
    expect(computeHeights([]).size).toBe(0);
  });

  it('takes the LONGEST path to a leaf, not the shortest', () => {

    const c = bp(3, [raw(99)]);
    const b = bp(2, [c, raw(98)]);
    const heights = computeHeights([b]);
    expect(heights.get(99)).toBe(0);
    expect(heights.get(98)).toBe(0);
    expect(heights.get(3)).toBe(1);
    expect(heights.get(2)).toBe(2);
  });

  it('memoises by typeId — a shared subtree resolves to one stable height', () => {

    const shared = () => bp(2, [raw(99)]);
    const parentA = bp(10, [shared()]);
    const parentB = bp(11, [shared(), raw(98)]);
    const heights = computeHeights([parentA, parentB]);
    expect(heights.get(2)).toBe(1);
    expect(heights.get(10)).toBe(2);
    expect(heights.get(11)).toBe(2);
  });
});

describe('TreeResolver — reference-blueprint fixture is well-formed', () => {
  it('pins Rifter minerals, Archon floors, and Legion marginal gas', () => {
    type FixtureEntry = {
      blueprintTypeId: number;
      outputTypeId: number;
      materials: Record<string, number>;
    };
    const fixture = flatMaterialsFixture as Record<string, unknown>;
    const entryOf = (name: string): FixtureEntry => fixture[name] as FixtureEntry;
    for (const name of ['Rifter', 'Drake', 'Archon', 'Legion'] as const) {
      const entry = entryOf(name);
      expect(entry).toBeDefined();
      expect(entry.blueprintTypeId).toBeGreaterThan(0);
      expect(entry.outputTypeId).toBeGreaterThan(0);
      expect(Object.keys(entry.materials).length).toBeGreaterThan(0);
    }
    const rifter = entryOf('Rifter');
    const archon = entryOf('Archon');
    const legion = entryOf('Legion');
    expect(rifter.materials).toEqual({
      '34': 32000,
      '35': 6000,
      '36': 2500,
      '37': 500,
    });
    expect(archon.materials['34']).toBeGreaterThan(2_000_000);
    expect(archon.materials['35']).toBeGreaterThan(7_000_000);
    expect(legion.blueprintTypeId).toBe(29987);
    expect(legion.materials['30370']).toBeLessThan(2_000);
    expect(legion.materials['30251']).toBe(452);
  });
});

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
    expect(flat.size).toBe(0);
    expect(resolver.stats().cycleWarnings).toHaveLength(0);
  });

  it('keeps real materials when a self-edge sits alongside them', () => {
    const rows = [
      {
        blueprintTypeId: 900,
        activities: {
          manufacturing: {
            materials: [
              { typeID: 24684, quantity: 1 },
              { typeID: 34, quantity: 500 },
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
    expect(Object.fromEntries(flat)).toEqual({ 34: 30 });
    expect(resolver.stats().cycleWarnings).toHaveLength(0);
  });

  it("treats a degenerate blueprint's product as a leaf when consumed elsewhere", () => {

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
      {
        blueprintTypeId: 901,
        activities: {
          manufacturing: {
            materials: [{ typeID: 24684, quantity: 7 }],
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

type ResolverRow = Parameters<typeof buildIndexesFromActivities>[0][number];

const TUNGSTEN_CARBIDE = 16672;
const ROLLED_TUNGSTEN_ALLOY = 16657;
const SULFURIC_ACID = 16661;
const NITROGEN_FUEL_BLOCK = 4051;
const TUNGSTEN = 16637;
const PLATINUM = 16644;
const SYLRAMIC_FIBERS = 16678;
const TC_ARMOR_PLATE = 11543;
const TC_ARMOR_PLATE_BP = 17350;
const CURSE_BP = 20126;

const TC_TEST_BP: ResolverRow = {
  blueprintTypeId: 45732,
  published: false,
  activities: {
    reaction: {
      materials: [
        { typeID: ROLLED_TUNGSTEN_ALLOY, quantity: 100 },
        { typeID: SULFURIC_ACID, quantity: 100 },
      ],
      products: [{ typeID: TUNGSTEN_CARBIDE, quantity: 20 }],
    },
  },
};
const TC_REAL_BP: ResolverRow = {
  blueprintTypeId: 46207,
  published: true,
  activities: {
    reaction: {
      materials: [
        { typeID: ROLLED_TUNGSTEN_ALLOY, quantity: 100 },
        { typeID: SULFURIC_ACID, quantity: 100 },
        { typeID: NITROGEN_FUEL_BLOCK, quantity: 5 },
      ],
      products: [{ typeID: TUNGSTEN_CARBIDE, quantity: 10000 }],
    },
  },
};

describe('TreeResolver — prefers published producers (collision)', () => {
  it.each([
    ['unpublished first', [TC_TEST_BP, TC_REAL_BP]],
    ['published first', [TC_REAL_BP, TC_TEST_BP]],
  ] as const)('picks the published TC formula when listed %s', (_order, rows) => {
    expect(buildIndexesFromActivities([...rows]).productToBlueprint.get(TUNGSTEN_CARBIDE)).toEqual({
      blueprintTypeId: 46207,
      quantityPerRun: 10000,
    });
  });

  it('breaks ties between two published producers deterministically (lowest id)', () => {
    const a: ResolverRow = {
      blueprintTypeId: 1002,
      published: true,
      activities: { manufacturing: { materials: [{ typeID: 34, quantity: 5 }], products: [{ typeID: 5001, quantity: 2 }] } },
    };
    const b: ResolverRow = {
      blueprintTypeId: 1001,
      published: true,
      activities: { manufacturing: { materials: [{ typeID: 34, quantity: 5 }], products: [{ typeID: 5001, quantity: 9 }] } },
    };
    expect(buildIndexesFromActivities([a, b]).productToBlueprint.get(5001)?.blueprintTypeId).toBe(1001);
    expect(buildIndexesFromActivities([b, a]).productToBlueprint.get(5001)?.blueprintTypeId).toBe(1001);
  });

  it('falls back to a lone unpublished producer (nothing dropped)', () => {
    const only: ResolverRow = {
      blueprintTypeId: 2002,
      published: false,
      activities: { manufacturing: { materials: [{ typeID: 34, quantity: 5 }], products: [{ typeID: 6002, quantity: 1 }] } },
    };
    expect(buildIndexesFromActivities([only]).productToBlueprint.get(6002)?.blueprintTypeId).toBe(2002);
  });

  it('INVARIANT: no product resolves to an unpublished producer when a published one exists', () => {
    const rows: ResolverRow[] = [
      TC_TEST_BP,
      TC_REAL_BP,
      { blueprintTypeId: 1001, published: true, activities: { manufacturing: { materials: [{ typeID: 34, quantity: 5 }], products: [{ typeID: 5001, quantity: 1 }] } } },
      { blueprintTypeId: 1003, published: false, activities: { manufacturing: { materials: [{ typeID: 34, quantity: 5 }], products: [{ typeID: 5001, quantity: 1 }] } } },
      { blueprintTypeId: 2002, published: false, activities: { manufacturing: { materials: [{ typeID: 34, quantity: 5 }], products: [{ typeID: 6002, quantity: 1 }] } } },
    ];
    const { productToBlueprint } = buildIndexesFromActivities(rows);

    const productsWithPublished = new Set<number>();
    const publishedProducers = new Set<number>();
    for (const r of rows) {
      for (const act of Object.values(r.activities)) {
        for (const p of act?.products ?? []) {
          if (r.published !== false) {
            productsWithPublished.add(p.typeID);
            publishedProducers.add(r.blueprintTypeId);
          }
        }
      }
    }
    for (const productId of productsWithPublished) {
      const chosen = productToBlueprint.get(productId);
      expect(chosen).toBeDefined();
      expect(publishedProducers.has(chosen!.blueprintTypeId)).toBe(true);
    }
  });
});

describe('TreeResolver — Curse chain corrected output (T2 regression)', () => {

  const RTA_FORMULA: ResolverRow = {
    blueprintTypeId: 46178,
    published: true,
    activities: {
      reaction: {
        materials: [
          { typeID: TUNGSTEN, quantity: 100 },
          { typeID: PLATINUM, quantity: 100 },
          { typeID: NITROGEN_FUEL_BLOCK, quantity: 5 },
        ],
        products: [{ typeID: ROLLED_TUNGSTEN_ALLOY, quantity: 200 }],
      },
    },
  };
  const PLATE_BP: ResolverRow = {
    blueprintTypeId: TC_ARMOR_PLATE_BP,
    published: true,
    activities: {
      manufacturing: {
        materials: [
          { typeID: TUNGSTEN_CARBIDE, quantity: 44 },
          { typeID: SYLRAMIC_FIBERS, quantity: 11 },
        ],
        products: [{ typeID: TC_ARMOR_PLATE, quantity: 1 }],
      },
    },
  };
  const CURSE: ResolverRow = {
    blueprintTypeId: CURSE_BP,
    published: true,
    activities: {
      manufacturing: {
        materials: [{ typeID: TC_ARMOR_PLATE, quantity: 3750 }],
        products: [{ typeID: 20125, quantity: 1 }],
      },
    },
  };
  const universe: ResolverRow[] = [CURSE, PLATE_BP, TC_TEST_BP, TC_REAL_BP, RTA_FORMULA];

  it('flattens Curse to the corrected (not 500x-inflated) raw totals', () => {
    const indexes = buildIndexesFromActivities(universe);
    expect(indexes.productToBlueprint.get(TUNGSTEN_CARBIDE)?.blueprintTypeId).toBe(46207);
    const fixed = new TreeResolver(indexes);
    const flat = fixed.flatForOneRun(CURSE_BP);

    expect(flat.get(TUNGSTEN)).toBeCloseTo(825, 6);
    expect(flat.get(PLATINUM)).toBeCloseTo(825, 6);
    expect(flat.get(SYLRAMIC_FIBERS)).toBeCloseTo(41250, 6);

    const buggy = new TreeResolver(
      buildIndexesFromActivities(universe.filter((r) => r.blueprintTypeId !== 46207)),
    );
    const buggyFlat = buggy.flatForOneRun(CURSE_BP);
    expect(buggyFlat.get(TUNGSTEN)).toBeCloseTo(412500, 4);
    expect(buggyFlat.get(PLATINUM)).toBeCloseTo(412500, 4);
  });

  it('control: a single-published-producer chain (T3-like) is unaffected', () => {
    const rows: ResolverRow[] = [
      { blueprintTypeId: 29985, published: true, activities: { manufacturing: { materials: [{ typeID: 30474, quantity: 21 }], products: [{ typeID: 29984, quantity: 1 }] } } },
      { blueprintTypeId: 90001, published: true, activities: { reaction: { materials: [{ typeID: 34, quantity: 100 }], products: [{ typeID: 30474, quantity: 200 }] } } },
    ];
    const flat = new TreeResolver(buildIndexesFromActivities(rows)).flatForOneRun(29985);
    expect(flat.get(34)).toBeCloseTo(10.5, 6);
  });
});

describe('pickBuildTimeSeconds', () => {
  it('prefers manufacturing, then reaction, and ignores degenerate or copy-only times', () => {
    expect(pickBuildTimeSeconds({ manufacturing: { time: 6000 } })).toBe(6000);
    expect(pickBuildTimeSeconds({ reaction: { time: 3600 } })).toBe(3600);
    expect(pickBuildTimeSeconds({ manufacturing: { time: 6000 }, reaction: { time: 3600 } })).toBe(
      6000,
    );
    expect(
      pickBuildTimeSeconds({ copying: { time: 192000 }, manufacturing: { time: 240000 } }),
    ).toBe(240000);
    expect(pickBuildTimeSeconds({ copying: { time: 192000 } })).toBeNull();
    expect(pickBuildTimeSeconds({ manufacturing: { time: 0 } })).toBeNull();
    expect(pickBuildTimeSeconds({ manufacturing: { products: [{ typeID: 1, quantity: 1 }] } })).toBeNull();
    expect(pickBuildTimeSeconds({})).toBeNull();
  });
});

describe('hashResolverInputs', () => {
  const row = (
    blueprintTypeId: number,
    activities: unknown,
    published: boolean | null = true,
  ) => ({ blueprintTypeId, activities, published });

  it('is order-stable, changes with edges or published, and treats null as published', () => {
    const a = row(45, { reaction: { materials: [{ typeID: 1, quantity: 2 }], products: [{ typeID: 9, quantity: 1 }] } });
    const b = row(46, { manufacturing: { materials: [{ typeID: 3, quantity: 4 }], products: [{ typeID: 8, quantity: 1 }] } });
    expect(hashResolverInputs([a, b])).toBe(hashResolverInputs([b, a]));
    const base = [row(45, { manufacturing: { materials: [{ typeID: 1, quantity: 2 }], products: [{ typeID: 9, quantity: 1 }] } })];
    const more = [row(45, { manufacturing: { materials: [{ typeID: 1, quantity: 2 }, { typeID: 2, quantity: 1 }], products: [{ typeID: 9, quantity: 1 }] } })];
    expect(hashResolverInputs(base)).not.toBe(hashResolverInputs(more));
    const activities = { manufacturing: { materials: [{ typeID: 1, quantity: 2 }], products: [{ typeID: 9, quantity: 1 }] } };
    expect(hashResolverInputs([row(45, activities, true)])).not.toBe(
      hashResolverInputs([row(45, activities, false)]),
    );
    expect(hashResolverInputs([row(45, activities, null)])).toBe(
      hashResolverInputs([row(45, activities, true)]),
    );
    expect(hashResolverInputs([])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('roundedFlatRows', () => {
  it('rounds to whole units and drops materials that round to zero', () => {
    const rows = roundedFlatRows(
      new Map([
        [34, 100.4],
        [35, 0.3],
        [36, 2.5],
      ]),
      681,
    );
    expect(rows).toEqual([
      { blueprintTypeId: 681, rawMaterialTypeId: 34, totalQuantity: BigInt(100) },
      { blueprintTypeId: 681, rawMaterialTypeId: 36, totalQuantity: BigInt(3) },
    ]);
    expect(roundedFlatRows(new Map([[1, 0.2]]), 5)).toEqual([]);
  });
});

describe('hashGateSkips', () => {
  it.each([
    [{ forceRebuild: false, hashBefore: 'x', hashAfter: 'x' }, true],
    [{ forceRebuild: true, hashBefore: 'x', hashAfter: 'x' }, false],
    [{ forceRebuild: false, hashBefore: null, hashAfter: 'x' }, false],
    [{ forceRebuild: false, hashBefore: 'x', hashAfter: 'y' }, false],
  ] as const)('skips only on an unforced matching prior hash %#', (input, expected) => {
    expect(hashGateSkips(input)).toBe(expected);
  });
});

describe('assertNoResolverCycles', () => {
  it('passes a clean walk and lists the first warnings when a cycle exists', () => {
    expect(() => assertNoResolverCycles({ cycleWarnings: [] })).not.toThrow();
    expect(() =>
      assertNoResolverCycles({ cycleWarnings: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    ).toThrow(/6 unexpected cycle\(s\); first few: a \| b \| c \| d \| e$/);
  });
});

describe('makeBatchInserter', () => {
  it('flushes every batchSize rows and the remainder on flush(), tracking the written count', async () => {
    const batches: number[][] = [];
    const inserter = makeBatchInserter<number>(2, async (batch) => {
      batches.push([...batch]);
    });
    await inserter.add([1, 2, 3]);
    expect(batches).toEqual([[1, 2]]);
    expect(inserter.written()).toBe(2);
    await inserter.add([4]);
    expect(batches).toEqual([[1, 2], [3, 4]]);
    await inserter.flush();
    expect(batches).toEqual([[1, 2], [3, 4]]);
    await inserter.add([5]);
    await inserter.flush();
    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    expect(inserter.written()).toBe(5);
  });

  it('never calls the sink when nothing was added', async () => {
    let calls = 0;
    const inserter = makeBatchInserter<number>(2, async () => {
      calls++;
    });
    await inserter.flush();
    expect(calls).toBe(0);
    expect(inserter.written()).toBe(0);
  });
});
