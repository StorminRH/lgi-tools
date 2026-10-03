import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { STRUCTURE_RIG_SIZE_ATTR } from './constants';
import {
  eveGroups,
  eveTypes,
  industryBlueprints,
  industryModifiers,
  industryTargetFilters,
  typeDogma,
} from './schema';
import { INV_683, MFG_681, RXN_46175 } from './__fixtures__/blueprint-activities';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import {
  getBlueprintActivities,
  getIndustryTargetFilters,
  getProductionModifiers,
  getStructureRigs,
  readShipMassByType,
} from './queries';

const harness = await createDbTestHarness({
  schema: 'test_eve_activities',
  tables: [
    'industry_blueprints',
    'eve_groups',
    'eve_types',
    'type_dogma',
    'industry_target_filters',
    'industry_modifiers',
  ],
  steerDbProxy: true,
});

describe.skipIf(!harness.reachable)('getBlueprintActivities executes against Postgres', () => {
  beforeAll(async () => {
    await harness.db
      .insert(industryBlueprints)
      .values([
        { blueprintTypeId: 681, maxProductionLimit: 1, activities: MFG_681 },
        { blueprintTypeId: 683, maxProductionLimit: 1, activities: INV_683 },
        { blueprintTypeId: 46175, maxProductionLimit: 1, activities: RXN_46175 },
      ]);
    await harness.db.insert(eveTypes).values([
      {
        id: 670,
        groupId: 25,
        name: 'Capsule',
        mass: 32_000,
        published: true,
      },
      {
        id: 999_999,
        groupId: 25,
        name: 'Massless fixture',
        mass: null,
        published: false,
      },
    ]);
  });

  it('reads invention probability, datacores, and skills from the stored blob', async () => {
    const map = await getBlueprintActivities([681, 683, 46175]);
    expect(map.size).toBe(3);

    const inv = map.get(683)?.find((a) => a.name === 'invention');
    expect(inv?.activityId).toBe(8);
    expect(inv?.time).toBe(63900);
    expect(inv?.products).toEqual([{ typeId: 39581, quantity: 1, probability: 0.3 }]);
    expect(inv?.materials).toEqual([
      { typeId: 20416, quantity: 2 },
      { typeId: 25887, quantity: 2 },
    ]);
    expect(inv?.skills).toEqual([
      { typeId: 11442, level: 1 },
      { typeId: 11454, level: 1 },
      { typeId: 21790, level: 1 },
    ]);
  });

  it('leaves probability absent on non-invention products', async () => {
    const map = await getBlueprintActivities([681, 683, 46175]);

    const rxn = map.get(46175)?.find((a) => a.name === 'reaction');
    expect(rxn?.activityId).toBe(11);
    expect(rxn?.products[0]?.probability).toBeUndefined();

    const mfg681 = map.get(681)?.find((a) => a.name === 'manufacturing');
    expect(mfg681?.products[0]?.probability).toBeUndefined();
    expect(map.get(681)?.find((a) => a.name === 'invention')).toBeUndefined();
  });

  it('returns an empty map for no ids', async () => {
    expect((await getBlueprintActivities([])).size).toBe(0);
  });

  it('reads one seeded ship mass and preserves missing values', async () => {
    await expect(readShipMassByType(harness.db, 670)).resolves.toBe(32_000);
    await expect(readShipMassByType(harness.db, 999_999)).resolves.toBeNull();
    await expect(readShipMassByType(harness.db, 123_456)).resolves.toBeNull();
  });
});

describe.skipIf(!harness.reachable)('industry bonus sources execute against Postgres', () => {
  const RAITARU = 35825;
  const EQUIPMENT_RIG = 43920;
  const REACTOR_RIG = 46486;
  const COPY_RIG = 43891;
  const COMBAT_RIG = 47360;
  const RETIRED_RIG = 43921;
  const RIG_GROUP = 1816;

  const group = (id: number, categoryId: number, name: string) => ({
    id,
    categoryId,
    name,
    useBasePrice: false,
    anchored: false,
    anchorable: false,
    fittableNonSingleton: false,
    published: true,
  });
  const modifier = (
    sourceTypeId: number,
    activity: string,
    kind: string,
    attributeId: number,
    filterId: number | null,
    [factorHigh, factorLow, factorNull]: [number, number, number],
  ) => ({ sourceTypeId, activity, kind, attributeId, filterId, factorHigh, factorLow, factorNull });

  beforeAll(async () => {
    await harness.db.insert(industryTargetFilters).values([
      { id: 2, name: 'Equipment', categoryIds: [7, 20, 22], groupIds: [12, 340, 448, 649] },
      { id: 18, name: 'Composite Reactions', categoryIds: [], groupIds: [428, 429, 4932] },
    ]);
    await harness.db.insert(eveGroups).values([
      group(1404, 65, 'Engineering Complex'),
      group(RIG_GROUP, 66, 'Structure Engineering Rig'),
    ]);
    await harness.db.insert(eveTypes).values([
      { id: RAITARU, groupId: 1404, name: 'Raitaru', published: true },
      { id: EQUIPMENT_RIG, groupId: RIG_GROUP, name: 'Standup M-Set Equipment Manufacturing Material Efficiency I', published: true },
      { id: REACTOR_RIG, groupId: RIG_GROUP, name: 'Standup M-Set Composite Reactor Material Efficiency I', published: true },
      { id: COPY_RIG, groupId: RIG_GROUP, name: 'Standup M-Set Blueprint Copy Accelerator I', published: true },
      { id: COMBAT_RIG, groupId: RIG_GROUP, name: 'Standup M-Set Missile Application I', published: true },
      { id: RETIRED_RIG, groupId: RIG_GROUP, name: 'Retired Equipment Rig', published: false },
    ]);
    const rigDogma = (typeId: number, canFit: number) => ({
      typeId,
      attributes: { [STRUCTURE_RIG_SIZE_ATTR]: 2, 1298: canFit },
    });
    await harness.db.insert(typeDogma).values([
      { typeId: RAITARU, attributes: { [STRUCTURE_RIG_SIZE_ATTR]: 2 } },
      rigDogma(EQUIPMENT_RIG, 1404),
      rigDogma(REACTOR_RIG, 1406),
      rigDogma(COPY_RIG, 1404),
      rigDogma(COMBAT_RIG, 1657),
      rigDogma(RETIRED_RIG, 1404),
    ]);
    await harness.db.insert(industryModifiers).values([
      modifier(RAITARU, 'copying', 'time', 2602, null, [0.85, 0.85, 0.85]),
      modifier(RAITARU, 'manufacturing', 'cost', 2601, null, [0.97, 0.97, 0.97]),
      modifier(RAITARU, 'manufacturing', 'material', 2600, null, [0.99, 0.99, 0.99]),
      modifier(RAITARU, 'manufacturing', 'time', 2602, null, [0.85, 0.85, 0.85]),
      modifier(EQUIPMENT_RIG, 'manufacturing', 'material', 2538, 2, [0.98, 0.962, 0.958]),
      // A kind the planner does not model is left out rather than misread.
      modifier(EQUIPMENT_RIG, 'manufacturing', 'probability', 9999, 2, [1.1, 1.1, 1.1]),
      modifier(REACTOR_RIG, 'reaction', 'material', 2718, 18, [1, 0.98, 0.978]),
      modifier(COPY_RIG, 'copying', 'time', 2539, null, [0.8, 0.62, 0.58]),
      modifier(RETIRED_RIG, 'manufacturing', 'material', 2538, 2, [0.98, 0.962, 0.958]),
    ]);
  });

  it('reads every target filter with its category and group lists', async () => {
    await expect(getIndustryTargetFilters()).resolves.toEqual([
      { id: 2, name: 'Equipment', categoryIds: [7, 20, 22], groupIds: [12, 340, 448, 649] },
      { id: 18, name: 'Composite Reactions', categoryIds: [], groupIds: [428, 429, 4932] },
    ]);
  });

  it('groups the manufacturing and reaction bonuses by source type, leaving other activities out', async () => {
    const map = await getProductionModifiers([RAITARU, EQUIPMENT_RIG, REACTOR_RIG, COPY_RIG, COMBAT_RIG]);
    expect(map).toEqual(
      new Map([
        [
          RAITARU,
          [
            { activity: 'manufacturing', kind: 'cost', filterId: null, factor: { high: 0.97, low: 0.97, null: 0.97 } },
            { activity: 'manufacturing', kind: 'material', filterId: null, factor: { high: 0.99, low: 0.99, null: 0.99 } },
            { activity: 'manufacturing', kind: 'time', filterId: null, factor: { high: 0.85, low: 0.85, null: 0.85 } },
          ],
        ],
        [EQUIPMENT_RIG, [{ activity: 'manufacturing', kind: 'material', filterId: 2, factor: { high: 0.98, low: 0.962, null: 0.958 } }]],
        [REACTOR_RIG, [{ activity: 'reaction', kind: 'material', filterId: 18, factor: { high: 1, low: 0.98, null: 0.978 } }]],
      ]),
    );
  });

  it('returns an empty map for no ids', async () => {
    expect((await getProductionModifiers([])).size).toBe(0);
  });

  it('lists only the published structure rigs that carry a production bonus', async () => {
    await expect(getStructureRigs()).resolves.toEqual([
      { typeId: REACTOR_RIG, name: 'Standup M-Set Composite Reactor Material Efficiency I', canFitGroups: [1406], rigSize: 2 },
      { typeId: EQUIPMENT_RIG, name: 'Standup M-Set Equipment Manufacturing Material Efficiency I', canFitGroups: [1404], rigSize: 2 },
    ]);
  });
});
