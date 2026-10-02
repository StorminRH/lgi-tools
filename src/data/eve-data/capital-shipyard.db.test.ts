import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { SDE_CAPITAL_SHIPYARD_TYPE_ID } from './constants';
import { dgmAttributeTypes, eveGroups, eveTypes, typeDogma } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { getCapitalShipyardHullIds } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_capital_shipyard',
  tables: ['eve_groups', 'eve_types', 'type_dogma', 'dgm_attribute_types'],
  steerDbProxy: true,
});

const RAITARU = 35825;
const AZBEL = 35826;
const SOTIYO = 35827;
const ASTRAHUS = 35832;
const FORTIZAR = 35833;
const TATARA = 35836;
const MOREAU = 47512;
const CITADEL_GROUP = 1657;

const group = (id: number, name: string) => ({
  id,
  categoryId: 65,
  name,
  useBasePrice: false,
  anchored: false,
  anchorable: false,
  fittableNonSingleton: false,
  published: true,
});
const attribute = (id: number, name: string) => ({ id, name, published: false, stackable: true, highIsGood: true });

describe.skipIf(!harness.reachable)('getCapitalShipyardHullIds executes against Postgres', () => {
  beforeAll(async () => {
    await harness.db.insert(eveGroups).values([
      group(1404, 'Engineering Complex'),
      group(1406, 'Refinery'),
      group(CITADEL_GROUP, 'Citadel'),
      group(1415, 'Structure Engineering Service Module'),
    ]);
    await harness.db.insert(eveTypes).values([
      { id: RAITARU, groupId: 1404, name: 'Raitaru', published: true },
      { id: AZBEL, groupId: 1404, name: 'Azbel', published: true },
      { id: SOTIYO, groupId: 1404, name: 'Sotiyo', published: true },
      { id: ASTRAHUS, groupId: CITADEL_GROUP, name: 'Astrahus', published: true },
      { id: FORTIZAR, groupId: CITADEL_GROUP, name: 'Fortizar', published: true },
      { id: MOREAU, groupId: CITADEL_GROUP, name: "'Moreau' Fortizar", published: true },
      { id: TATARA, groupId: 1406, name: 'Tatara', published: true },
      { id: SDE_CAPITAL_SHIPYARD_TYPE_ID, groupId: 1415, name: 'Standup Capital Shipyard I', published: true },
    ]);
    await harness.db.insert(dgmAttributeTypes).values([
      attribute(1298, 'canFitShipGroup01'),
      attribute(1302, 'canFitShipType1'),
      attribute(1303, 'canFitShipType2'),
      attribute(1304, 'canFitShipType3'),
      attribute(2103, 'canFitShipType6'),
      attribute(50, 'cpu'),
    ]);
    await harness.db.insert(typeDogma).values([
      // As the SDE ships it: the shipyard names its hulls by type, one per attribute.
      { typeId: SDE_CAPITAL_SHIPYARD_TYPE_ID, attributes: { 50: 600, 1302: SOTIYO, 1303: AZBEL, 1304: FORTIZAR, 2103: MOREAU } },
    ]);
  });

  it('lists the hulls the capital shipyard fits, from its own fitting attributes', async () => {
    await expect(getCapitalShipyardHullIds()).resolves.toEqual(
      expect.arrayContaining([AZBEL, SOTIYO, FORTIZAR, MOREAU]),
    );
    const hulls = await getCapitalShipyardHullIds();
    expect(hulls).toHaveLength(4);
    expect(hulls).not.toContain(RAITARU);
    expect(hulls).not.toContain(ASTRAHUS);
    expect(hulls).not.toContain(TATARA);
  });
});
