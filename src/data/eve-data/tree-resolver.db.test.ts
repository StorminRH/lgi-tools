import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import type { PostgresJsDb } from '@/lib/db-types';
import { SDE_META_KEY_TREE_HASH } from './constants';
import { getSdeMetaValue } from './meta';
import {
  blueprintFlatMaterials,
  blueprintTrees,
  eveTypes,
  industryBlueprints,
} from './schema';
import { hashResolverInputs, resolveAllTrees } from './tree-resolver';
import type { BlueprintActivities } from './types';

const harness = await createDbTestHarness({
  schema: 'test_tree_resolver',
  tables: [
    'eve_types',
    'industry_blueprints',
    'blueprint_trees',
    'blueprint_flat_materials',
    'eve_data_meta',
  ],
  resetBetweenTests: 'truncate',
});

const SHIP_BP = 1000;
const COMPONENT_BP = 2000;
const REACTION_BP = 3000;

function manufacturing(
  materials: { typeID: number; quantity: number }[],
  product: { typeID: number; quantity: number },
): BlueprintActivities {
  return { manufacturing: { time: 60, materials, products: [product] } };
}

const SHIP = manufacturing(
  [
    { typeID: 34, quantity: 10 },
    { typeID: 200, quantity: 2 },
  ],
  { typeID: 100, quantity: 1 },
);
const COMPONENT = manufacturing([{ typeID: 35, quantity: 3 }], { typeID: 200, quantity: 1 });
const REACTION: BlueprintActivities = {
  reaction: {
    time: 120,
    materials: [{ typeID: 36, quantity: 5 }],
    products: [{ typeID: 300, quantity: 2 }],
  },
};

/**
 * Three blueprints covering each published state the left join yields: a
 * published type, a missing type row (null) and an unpublished type.
 */
async function seedBlueprints(): Promise<void> {
  await harness.db.insert(eveTypes).values([
    { id: SHIP_BP, groupId: 1, name: 'Ship Blueprint', published: true },
    { id: REACTION_BP, groupId: 1, name: 'Reaction Formula', published: false },
  ]);
  await harness.db.insert(industryBlueprints).values([
    { blueprintTypeId: SHIP_BP, maxProductionLimit: 10, activities: SHIP },
    { blueprintTypeId: COMPONENT_BP, maxProductionLimit: 10, activities: COMPONENT },
    { blueprintTypeId: REACTION_BP, maxProductionLimit: 10, activities: REACTION },
  ]);
}

/** The resolver input rows the seed yields, as the left join reads them. */
function seededInputs(component: BlueprintActivities) {
  return [
    { blueprintTypeId: SHIP_BP, activities: SHIP, published: true },
    { blueprintTypeId: COMPONENT_BP, activities: component, published: null },
    { blueprintTypeId: REACTION_BP, activities: REACTION, published: false },
  ];
}

function readFlatMaterials() {
  return harness.db
    .select({
      blueprintTypeId: blueprintFlatMaterials.blueprintTypeId,
      rawMaterialTypeId: blueprintFlatMaterials.rawMaterialTypeId,
      totalQuantity: blueprintFlatMaterials.totalQuantity,
    })
    .from(blueprintFlatMaterials)
    .orderBy(asc(blueprintFlatMaterials.blueprintTypeId), asc(blueprintFlatMaterials.rawMaterialTypeId));
}

function resolve() {
  return resolveAllTrees(harness.db as PostgresJsDb);
}

describe.skipIf(!harness.reachable)('resolveAllTrees executes against Postgres', () => {
  it('builds trees and flat materials from the rows it hashes and stores that hash', async () => {
    await seedBlueprints();
    const expectedHash = hashResolverInputs(seededInputs(COMPONENT));

    const summary = await resolve();

    expect(summary).toEqual({
      blueprintsResolved: 3,
      flatMaterialsWritten: 4,
      treesWritten: 3,
      memoHits: expect.any(Number),
      memoMisses: expect.any(Number),
      cycleWarnings: [],
      hashBefore: null,
      hashAfter: expectedHash,
      skipped: false,
      durationMs: expect.any(Number),
    });
    expect(await getSdeMetaValue(harness.db, SDE_META_KEY_TREE_HASH)).toBe(expectedHash);
    expect(await readFlatMaterials()).toEqual([
      { blueprintTypeId: SHIP_BP, rawMaterialTypeId: 34, totalQuantity: BigInt(10) },
      { blueprintTypeId: SHIP_BP, rawMaterialTypeId: 35, totalQuantity: BigInt(6) },
      { blueprintTypeId: COMPONENT_BP, rawMaterialTypeId: 35, totalQuantity: BigInt(3) },
      { blueprintTypeId: REACTION_BP, rawMaterialTypeId: 36, totalQuantity: BigInt(5) },
    ]);
    const [shipTree] = await harness.db
      .select({ treeJson: blueprintTrees.treeJson })
      .from(blueprintTrees)
      .where(eq(blueprintTrees.blueprintTypeId, SHIP_BP));
    expect(shipTree?.treeJson).toEqual([
      { typeId: 34, quantity: 10, inputs: [] },
      {
        typeId: 200,
        quantity: 2,
        inputs: [{ typeId: 35, quantity: 3, inputs: [] }],
        producedBy: { blueprintTypeId: COMPONENT_BP, quantityPerRun: 1, runsNeeded: 2 },
      },
    ]);
  });

  it('skips an unchanged input set and rebuilds from the new rows once they change', async () => {
    await seedBlueprints();
    const first = await resolve();

    const unchanged = await resolve();
    expect(unchanged).toMatchObject({
      blueprintsResolved: 0,
      treesWritten: 0,
      hashBefore: first.hashAfter,
      hashAfter: first.hashAfter,
      skipped: true,
    });

    const reworkedComponent = manufacturing(
      [
        { typeID: 35, quantity: 3 },
        { typeID: 37, quantity: 1 },
      ],
      { typeID: 200, quantity: 1 },
    );
    await harness.db
      .update(industryBlueprints)
      .set({ activities: reworkedComponent })
      .where(eq(industryBlueprints.blueprintTypeId, COMPONENT_BP));
    const expectedHash = hashResolverInputs(seededInputs(reworkedComponent));

    const rebuilt = await resolve();

    expect(rebuilt).toMatchObject({
      blueprintsResolved: 3,
      hashBefore: first.hashAfter,
      hashAfter: expectedHash,
      skipped: false,
    });
    expect(expectedHash).not.toBe(first.hashAfter);
    expect(await getSdeMetaValue(harness.db, SDE_META_KEY_TREE_HASH)).toBe(expectedHash);
    expect(await readFlatMaterials()).toContainEqual({
      blueprintTypeId: SHIP_BP,
      rawMaterialTypeId: 37,
      totalQuantity: BigInt(2),
    });
  });
});
