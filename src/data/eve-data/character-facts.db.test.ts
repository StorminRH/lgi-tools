import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { dgmAttributeTypes, eveGroups, eveNpcStations, eveSolarSystems, eveTypes, typeDogma } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getImplantDogma, getNpcStationFacts, getSkillCatalog, getSystemFacts } from './character-facts';

const harness = await createDbTestHarness({
  schema: 'test_character_facts',
  tables: ['eve_groups', 'eve_types', 'eve_solar_systems', 'eve_npc_stations', 'type_dogma', 'dgm_attribute_types'],
  steerDbProxy: true,
});

const IMPLANTNESS = 331;
const PERCEPTION_BONUS = 178;
const INTELLIGENCE_BONUS = 176;
const SKILL_TIME_CONSTANT = 275;

const attribute = (id: number, name: string) => ({
  id,
  name,
  published: true,
  stackable: true,
  highIsGood: true,
});

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

const type = (id: number, groupId: number, name: string, published = true) => ({ id, groupId, name, published });

describe.skipIf(!harness.reachable)('character facts read the SDE', () => {
  beforeAll(async () => {
    await harness.db.insert(dgmAttributeTypes).values([
      attribute(IMPLANTNESS, 'implantness'),
      attribute(PERCEPTION_BONUS, 'perceptionBonus'),
      attribute(INTELLIGENCE_BONUS, 'intelligenceBonus'),
      attribute(SKILL_TIME_CONSTANT, 'skillTimeConstant'),
      attribute(9999, 'unrelated'),
    ]);
    await harness.db.insert(eveGroups).values([
      group(257, 16, 'Spaceship Command'),
      group(1210, 16, 'Armor'),
      group(300, 20, 'Cyberimplant'),
    ]);
    await harness.db.insert(eveTypes).values([
      type(3334, 257, 'Caldari Cruiser'),
      type(3327, 257, 'Spaceship Command'),
      type(3392, 1210, 'Mechanics'),
      type(3399, 1210, 'Retired Armor Skill', false),
      type(10217, 300, 'Ocular Filter - Improved'),
      type(10222, 300, 'Cybernetic Subprocessor - Improved'),
      type(42, 300, 'Dogmaless implant'),
    ]);
    await harness.db.insert(typeDogma).values([
      { typeId: 3334, attributes: { [SKILL_TIME_CONSTANT]: 5, 9999: 1 } },
      { typeId: 3392, attributes: { [SKILL_TIME_CONSTANT]: 1 } },
      { typeId: 10217, attributes: { [IMPLANTNESS]: 1, [PERCEPTION_BONUS]: 5, [INTELLIGENCE_BONUS]: 0 } },
      { typeId: 10222, attributes: { [IMPLANTNESS]: 4, [INTELLIGENCE_BONUS]: 5 } },
    ]);
    await harness.db.insert(eveSolarSystems).values([
      { id: 30000142, constellationId: 1, regionId: 1, name: 'Jita', securityStatus: 0.945913 },
      { id: 30002813, constellationId: 1, regionId: 1, name: 'Tama', securityStatus: 0.282556 },
      { id: 31000005, constellationId: 1, regionId: 1, name: 'Thera', securityStatus: -0.99, wormholeClassId: 12 },
    ]);
    await harness.db.insert(eveNpcStations).values([
      {
        id: 60003760,
        solarSystemId: 30000142,
        operationId: 14,
        typeId: 52678,
        ownerId: 1000035,
        name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        manufacturingCapable: true,
        researchCapable: true,
        industryCapable: true,
      },
      {
        id: 60008494,
        solarSystemId: 30002813,
        operationId: 32,
        typeId: 1932,
        ownerId: 1000086,
        name: null,
        manufacturingCapable: false,
        researchCapable: false,
        industryCapable: false,
      },
    ]);
  });

  it('classifies systems and skips unknown ids', async () => {
    expect(await getSystemFacts([30000142, 30002813, 31000005, 1])).toEqual(
      new Map([
        [30000142, { name: 'Jita', security: 0.945913, secClass: 'high' }],
        [30002813, { name: 'Tama', security: 0.282556, secClass: 'low' }],
        [31000005, { name: 'Thera', security: -0.99, secClass: 'wormhole' }],
      ]),
    );
    expect(await getSystemFacts([])).toEqual(new Map());
  });

  it('returns station names with their system, null when the backfill has not named them', async () => {
    expect(await getNpcStationFacts([60003760, 60008494, 1])).toEqual(
      new Map([
        [60003760, { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 }],
        [60008494, { name: null, systemId: 30002813 }],
      ]),
    );
  });

  it('reads implant slot and non-zero attribute bonuses by dogma name', async () => {
    expect(await getImplantDogma([10217, 10222, 42])).toEqual(
      new Map([
        [10217, { slot: 1, bonus: { perception: 5 } }],
        [10222, { slot: 4, bonus: { intelligence: 5 } }],
        [42, { slot: null, bonus: {} }],
      ]),
    );
    expect(await getImplantDogma([])).toEqual(new Map());
  });

  it('builds the catalog from published skills only, ranked from dogma with a fallback', async () => {
    expect(await getSkillCatalog()).toEqual([
      { groupId: 1210, name: 'Armor', skills: [{ typeId: 3392, name: 'Mechanics', rank: 1 }] },
      {
        groupId: 257,
        name: 'Spaceship Command',
        skills: [
          { typeId: 3334, name: 'Caldari Cruiser', rank: 5 },
          { typeId: 3327, name: 'Spaceship Command', rank: 1 },
        ],
      },
    ]);
  });
});
