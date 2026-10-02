import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { eveNpcStations, eveSolarSystems } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { getManufacturingStationIndex } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_station_index',
  tables: ['eve_solar_systems', 'eve_npc_stations'],
  steerDbProxy: true,
});

const station = (id: number, solarSystemId: number, name: string | null, flags: { manufacturing: boolean; industry: boolean }) => ({
  id,
  solarSystemId,
  operationId: 14,
  typeId: 52678,
  ownerId: 1000035,
  name,
  manufacturingCapable: flags.manufacturing,
  researchCapable: false,
  industryCapable: flags.industry,
});

describe.skipIf(!harness.reachable)('getManufacturingStationIndex executes against Postgres', () => {
  beforeAll(async () => {
    await harness.db.insert(eveSolarSystems).values([
      { id: 30000142, constellationId: 1, regionId: 1, name: 'Jita', securityStatus: 0.945913 },
      { id: 30002813, constellationId: 1, regionId: 1, name: 'Tama', securityStatus: 0.282556 },
    ]);
    await harness.db.insert(eveNpcStations).values([
      station(60003760, 30000142, 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', { manufacturing: true, industry: true }),
      station(60002959, 30002813, 'Tama VII - Moon 9 - Republic Security Services Testing Facilities', { manufacturing: true, industry: true }),
      // Research only, no industry, and a name ESI has not resolved yet: none can take a manufacturing job here.
      station(60000361, 30000142, 'Jita IV - Moon 6 - Ytiri Storage', { manufacturing: false, industry: true }),
      station(60000364, 30000142, 'Jita IV - Moon 5 - Ytiri Warehouse', { manufacturing: true, industry: false }),
      station(60000367, 30000142, null, { manufacturing: true, industry: true }),
    ]);
  });

  it('lists named manufacturing stations by name, with their system and its security', async () => {
    await expect(getManufacturingStationIndex()).resolves.toEqual([
      { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142, security: 0.945913 },
      {
        id: 60002959,
        name: 'Tama VII - Moon 9 - Republic Security Services Testing Facilities',
        systemId: 30002813,
        security: 0.282556,
      },
    ]);
  });
});
