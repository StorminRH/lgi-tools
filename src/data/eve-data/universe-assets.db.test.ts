import { beforeEach, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  dgmAttributeTypes,
  eveCategories,
  eveConstellations,
  eveDataMeta,
  eveGroups,
  eveRegions,
  eveSolarSystems,
  eveSystemJumps,
  eveTypes,
  typeDogma,
} from './schema';
import {
  readAdjacencyGraph,
  readSystemDirectory,
  readWormholeCodex,
} from './universe-assets';

const harness = await createDbTestHarness({
  schema: 'test_universe_assets',
  tables: [
    'eve_categories',
    'eve_groups',
    'eve_types',
    'dgm_attribute_types',
    'type_dogma',
    'eve_regions',
    'eve_constellations',
    'eve_solar_systems',
    'eve_system_jumps',
    'eve_data_meta',
  ],
  resetBetweenTests: 'truncate',
});

beforeEach(async () => {
  if (!harness.reachable) return;
  await harness.db.insert(eveDataMeta).values({
    key: 'sde_version',
    value: '3444265',
  });
  await harness.db.insert(eveCategories).values({
    id: 1,
    name: 'Entity',
    published: true,
  });
  await harness.db.insert(eveGroups).values({
    id: 988,
    categoryId: 1,
    name: 'Wormhole',
    useBasePrice: false,
    anchored: false,
    anchorable: false,
    fittableNonSingleton: false,
    published: true,
  });
  await harness.db.insert(eveTypes).values([
    {
      id: 30647,
      groupId: 988,
      name: 'Wormhole B274',
      published: true,
    },
    {
      id: 30831,
      groupId: 988,
      name: 'Wormhole K162',
      published: false,
    },
    {
      id: 32894,
      groupId: 988,
      name: 'QA Wormhole A',
      published: false,
    },
    {
      id: 32895,
      groupId: 988,
      name: 'QA Wormhole B',
      published: false,
    },
  ]);
  await harness.db.insert(dgmAttributeTypes).values([
    {
      id: 1381,
      name: 'wormholeTargetSystemClass',
      published: true,
      stackable: false,
      highIsGood: false,
    },
    {
      id: 1382,
      name: 'wormholeMaxStableTime',
      published: true,
      stackable: false,
      highIsGood: false,
    },
    {
      id: 1383,
      name: 'wormholeMaxStableMass',
      published: true,
      stackable: false,
      highIsGood: false,
    },
    {
      id: 1384,
      name: 'wormholeMassRegeneration',
      published: true,
      stackable: false,
      highIsGood: false,
    },
    {
      id: 1385,
      name: 'wormholeMaxJumpMass',
      published: true,
      stackable: false,
      highIsGood: false,
    },
  ]);
  await harness.db.insert(typeDogma).values({
    typeId: 30647,
    attributes: {
      1381: 7,
      1382: 1440,
      1383: 2_000_000_000,
      1384: 0,
      1385: 375_000_000,
    },
  });
  await harness.db.insert(typeDogma).values([
    { typeId: 32894, attributes: {} },
    { typeId: 32895, attributes: {} },
  ]);
  await harness.db.insert(eveRegions).values({
    id: 10_000_002,
    name: 'The Forge',
  });
  await harness.db.insert(eveConstellations).values({
    id: 20_000_020,
    regionId: 10_000_002,
    name: 'Kimotoro',
  });
  await harness.db.insert(eveSolarSystems).values([
    {
      id: 30_000_142,
      constellationId: 20_000_020,
      regionId: 10_000_002,
      name: 'Jita',
      securityStatus: 0.9,
      wormholeClassId: 7,
    },
    {
      id: 30_000_144,
      constellationId: 20_000_020,
      regionId: 10_000_002,
      name: 'Perimeter',
      securityStatus: 1,
      wormholeClassId: 7,
    },
    {
      id: 31_000_001,
      constellationId: 20_000_020,
      regionId: 10_000_002,
      name: 'J100001',
      securityStatus: -0.99,
      wormholeClassId: 1,
    },
  ]);
  await harness.db.insert(eveSystemJumps).values([
    { fromSystemId: 30_000_142, toSystemId: 30_000_144 },
    { fromSystemId: 30_000_144, toSystemId: 30_000_142 },
  ]);
});

describe.skipIf(!harness.reachable)('universe asset database reads', () => {
  it('stamps the system and adjacency assets and leaves gateless systems absent', async () => {
    const directory = await readSystemDirectory(harness.db);
    const adjacency = await readAdjacencyGraph(harness.db);

    expect(directory.version).toBe('3444265');
    expect(directory.systems).toContainEqual({
      id: 31_000_001,
      name: 'J100001',
      security: -0.99,
      whClassId: 1,
    });
    expect(adjacency).toEqual({
      version: '3444265',
      adjacency: [
        [30_000_142, [30_000_144]],
        [30_000_144, [30_000_142]],
      ],
    });
    expect(adjacency.adjacency.flatMap((entry) => entry)).not.toContain(
      31_000_001,
    );
  });

  it('includes unpublished K162 without dogma and resolves typed attributes by name', async () => {
    await expect(readWormholeCodex(harness.db)).resolves.toEqual({
      version: '3444265',
      types: [
        {
          code: 'B274',
          typeId: 30647,
          farSide: false,
          totalMass: 2_000_000_000,
          maxJumpMass: 375_000_000,
          massRegen: 0,
          lifetimeMinutes: 1440,
          sizeClass: 'L',
          targetClass: 7,
        },
        { code: 'K162', typeId: 30831, farSide: true },
      ],
    });
  });
});
