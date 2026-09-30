import { expect, test, vi } from 'vitest';
import {
  blueprintTrees,
  eveCategories,
  eveGroups,
  eveTypes,
  industryBlueprints,
  typeDogma,
} from '@/data/eve-data/schema';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { getBlueprintStructure } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_industry_planner_structure',
  tables: [
    'eve_categories',
    'eve_groups',
    'eve_types',
    'type_dogma',
    'industry_blueprints',
    'blueprint_trees',
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
}

test.skipIf(!harness.reachable)(
  'assembles a blueprint structure with raw buckets, job times, and manufacturing time skills',
  async () => {
    await seedWidgetChain();

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
    expect(plate?.nodeTimeSkills).toEqual({
      1100: [{ skillTypeId: 3396, skillName: 'Skill 3396', timePctPerLevel: -1 }],
    });
    await expect(getBlueprintStructure(1300)).resolves.toBeNull();
  },
);
