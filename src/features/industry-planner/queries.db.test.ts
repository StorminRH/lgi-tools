import { beforeAll, expect, test, vi } from 'vitest';
import {
  blueprintTrees,
  eveCategories,
  eveGroups,
  eveTypes,
  industryBlueprints,
  industryTargetFilters,
  typeDogma,
} from '@/data/eve-data/schema';
import { adjustedPrices, industryCostIndices } from '@/data/industry-indices/schema';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { getBlueprintStructure, getBuildLocation } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_industry_planner_structure',
  tables: [
    'eve_categories',
    'eve_groups',
    'eve_types',
    'type_dogma',
    'industry_blueprints',
    'blueprint_trees',
    'industry_target_filters',
    'industry_cost_indices',
    'adjusted_prices',
    'eve_npc_stations',
    'eve_station_operations',
  ],
  steerDbProxy: true,
});

const TIME_PER_LEVEL = 1982;

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

const type = (id: number, groupId: number, name: string, published = true) => ({
  id,
  groupId,
  name,
  published,
});

const leaf = (typeId: number, quantity: number): TreeNode => ({ typeId, quantity, inputs: [] });

async function seedWidgetChain(): Promise<void> {
  await harness.db.insert(eveCategories).values([
    { id: 4, name: 'Material', published: true },
    { id: 6, name: 'Ship', published: true },
    { id: 9, name: 'Blueprint', published: true },
    { id: 16, name: 'Skill', published: true },
    { id: 17, name: 'Commodity', published: true },
    { id: 43, name: 'Planetary Commodities', published: true },
  ]);
  await harness.db.insert(eveGroups).values([
    group(18, 4, 'Mineral'),
    group(25, 6, 'Frigate'),
    group(105, 9, 'Frigate Blueprint'),
    group(268, 16, 'Industry'),
    group(334, 17, 'Construction Components'),
    group(427, 4, 'Moon Materials'),
    group(428, 4, 'Intermediate Materials'),
    group(1034, 43, 'Refined Commodities'),
  ]);
  await harness.db.insert(eveTypes).values([
    type(1000, 105, 'Widget Blueprint'),
    type(1100, 105, 'Plate Blueprint'),
    type(1200, 105, 'Alloy Reaction Formula'),
    type(1300, 105, 'Retired Blueprint', false),
    type(2000, 25, 'Widget'),
    type(2100, 334, 'Plate'),
    type(2200, 428, 'Alloy'),
    type(34, 18, 'Tritanium'),
    type(16634, 427, 'Atmospheric Gases'),
    type(2393, 1034, 'Bacteria'),
    type(3380, 268, 'Industry'),
    type(3388, 268, 'Advanced Industry'),
    type(3395, 268, 'Advanced Small Ship Construction'),
  ]);
  await harness.db.insert(typeDogma).values([
    { typeId: 3380, attributes: { [TIME_PER_LEVEL]: -4 } },
    { typeId: 3388, attributes: { [TIME_PER_LEVEL]: -3 } },
    // A zero bonus and a missing bonus both leave the skill off the time levers.
    { typeId: 3395, attributes: { [TIME_PER_LEVEL]: 0, 275: 1 } },
    // Dogma without a type row: the lever keeps a placeholder name.
    { typeId: 3396, attributes: { [TIME_PER_LEVEL]: -1 } },
  ]);
  await harness.db.insert(industryBlueprints).values([
    {
      blueprintTypeId: 1000,
      maxProductionLimit: 10,
      activities: {
        manufacturing: {
          time: 600,
          skills: [
            { typeID: 3380, level: 1 },
            { typeID: 3388, level: 1 },
            { typeID: 3395, level: 1 },
          ],
          products: [{ typeID: 2000, quantity: 1 }],
        },
      },
    },
    {
      blueprintTypeId: 1100,
      maxProductionLimit: 100,
      activities: {
        manufacturing: {
          time: 300,
          skills: [{ typeID: 3396, level: 1 }],
          products: [{ typeID: 2100, quantity: 10 }],
        },
      },
    },
    {
      blueprintTypeId: 1200,
      maxProductionLimit: 100,
      activities: {
        reaction: {
          time: 3600,
          skills: [{ typeID: 3380, level: 1 }],
          products: [{ typeID: 2200, quantity: 200 }],
        },
      },
    },
    {
      blueprintTypeId: 1300,
      maxProductionLimit: 1,
      activities: { manufacturing: { time: 60, products: [{ typeID: 2000, quantity: 1 }] } },
    },
  ]);
  const tree: TreeNode[] = [
    leaf(9999, 1),
    leaf(2393, 3),
    {
      typeId: 2100,
      quantity: 4,
      producedBy: { blueprintTypeId: 1100, quantityPerRun: 10, runsNeeded: 1 },
      inputs: [
        leaf(34, 50),
        {
          typeId: 2200,
          quantity: 5,
          producedBy: { blueprintTypeId: 1200, quantityPerRun: 200, runsNeeded: 1 },
          inputs: [leaf(16634, 100)],
        },
      ],
    },
    leaf(34, 20),
  ];
  await harness.db
    .insert(blueprintTrees)
    .values({ blueprintTypeId: 1000, treeJson: tree, computedAt: new Date() });
  await harness.db.insert(industryTargetFilters).values([
    { id: 3, name: 'Ships', categoryIds: [6, 32], groupIds: [] },
    { id: 4, name: 'Charges', categoryIds: [8], groupIds: [] },
    { id: 5, name: 'Small T1 Ships', categoryIds: [], groupIds: [25, 31, 420] },
    { id: 14, name: 'Components', categoryIds: [], groupIds: [332, 334, 716, 964] },
    { id: 18, name: 'Composite Reactions', categoryIds: [], groupIds: [428, 429, 4932] },
  ]);
}

beforeAll(async () => {
  if (harness.reachable) await seedWidgetChain();
});

test.skipIf(!harness.reachable)(
  'assembles a blueprint structure with raw buckets, job times, and manufacturing time skills',
  async () => {

    const structure = await getBlueprintStructure(1000);
    expect(structure).not.toBeNull();
    if (structure === null) return;

    expect(structure.product).toEqual({
      typeId: 2000,
      name: 'Widget',
      quantityPerRun: 1,
      renderable: true,
    });
    expect(structure.activityId).toBe(1);

    // Raws are bucketed by group/category; an unlabelled raw falls to Other Materials,
    // and the legend is ordered by category rank rather than tree order.
    expect(structure.materialCategory).toEqual({
      9999: 'Other Materials',
      2393: 'Planetary',
      34: 'Minerals',
      16634: 'Moon Materials',
    });
    expect(structure.materialCategories).toEqual([
      { label: 'Minerals', tone: 'neutral' },
      { label: 'Moon Materials', tone: 'magenta' },
      { label: 'Planetary', tone: 'orange-soft' },
      { label: 'Other Materials', tone: 'neutral' },
    ]);
    expect(structure.materialNames[2100]).toBe('Plate');
    expect(structure.materialNames[9999]).toBeUndefined();

    expect(structure.topJobSeconds).toBe(600);
    expect(structure.nodeJobSeconds).toEqual({ 1000: 600, 1100: 300, 1200: 3600 });
    expect(structure.nodeActivityByBlueprint).toEqual({ 1000: 1, 1100: 1, 1200: 11 });
    // Each job is tagged with the target filters its product falls in, by
    // category (Ships) or by group (Small T1 Ships, Components, Composite Reactions).
    expect(structure.nodeFilterIds).toEqual({ 1000: [3, 5], 1100: [14], 1200: [18] });

    // Only manufacturing skills with a non-zero time bonus become levers; the
    // reaction formula's skill does not.
    expect(structure.nodeTimeSkills).toEqual({
      1000: [
        { skillTypeId: 3380, skillName: 'Industry', timePctPerLevel: -4 },
        { skillTypeId: 3388, skillName: 'Advanced Industry', timePctPerLevel: -3 },
      ],
      1100: [{ skillTypeId: 3396, skillName: 'Skill 3396', timePctPerLevel: -1 }],
    });

    expect(structure.rootHeight).toBe(3);
    expect(structure.buildTree.map((node) => node.typeId)).toEqual([2000]);
    expect(structure.buildTree[0]?.inputs.map((node) => node.typeId)).toEqual([
      9999, 2393, 2100, 34,
    ]);

    // A blueprint with no resolved tree still reports its product and own job,
    // and an unpublished blueprint resolves to nothing.
    const plate = await getBlueprintStructure(1100);
    expect(plate?.product.name).toBe('Plate');
    expect(plate?.product.renderable).toBe(false);
    expect(plate?.buildTree).toEqual([]);
    expect(plate?.materialCategories).toEqual([]);
    expect(plate?.nodeJobSeconds).toEqual({ 1100: 300 });
    expect(plate?.nodeFilterIds).toEqual({ 1100: [14] });
    expect(plate?.nodeTimeSkills).toEqual({
      1100: [{ skillTypeId: 3396, skillName: 'Skill 3396', timePctPerLevel: -1 }],
    });
    await expect(getBlueprintStructure(1300)).resolves.toBeNull();
  },
);


test.skipIf(!harness.reachable)(
  'build location prices every nested job input and leaves unavailable data unknown',
  async () => {
    const updatedAt = new Date();
    await harness.db.insert(industryCostIndices).values([
      { solarSystemId: 30000142, activity: 'manufacturing', costIndex: 0.03, updatedAt },
      { solarSystemId: 30000142, activity: 'reaction', costIndex: 0.07, updatedAt },
    ]);
    await harness.db.insert(adjustedPrices).values([
      { typeId: 34, adjustedPrice: 5, updatedAt },
      { typeId: 2100, adjustedPrice: 120, updatedAt },
      { typeId: 2200, adjustedPrice: 80, updatedAt },
      { typeId: 16634, adjustedPrice: 20, updatedAt },
      { typeId: 2393, adjustedPrice: null, updatedAt },
      { typeId: 2000, adjustedPrice: 999, updatedAt },
    ]);
    const location = await getBuildLocation(30000142, 1000);
    expect(location.stations).toEqual([]);
    expect(location.costIndices).toEqual({ manufacturing: 0.03, reaction: 0.07 });
    // Intermediate products and their own nested inputs are needed for sub-job fees.
    // Duplicate Tritanium appears once; null prices and the final product stay out.
    expect(location.adjustedPrices.sort((a, b) => a.typeId - b.typeId)).toEqual([
      { typeId: 34, adjustedPrice: 5 },
      { typeId: 2100, adjustedPrice: 120 },
      { typeId: 2200, adjustedPrice: 80 },
      { typeId: 16634, adjustedPrice: 20 },
    ]);
    await expect(getBuildLocation(30004759, 1300)).resolves.toEqual({
      stations: [],
      costIndices: { manufacturing: null, reaction: null },
      adjustedPrices: [],
    });
  },
);
