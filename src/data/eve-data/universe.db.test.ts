import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { emitUniverseNeon, type UniverseDataset } from './universe';
import { eveNpcStations, eveSolarSystems } from './schema';

// Proves the universe emit seam end-to-end against the local Docker Postgres: a
// mixed K-space + J-space dataset emits, reads back with its wormhole class and
// jump graph intact, every jump endpoint resolves to a system (FK integrity), and
// a second emit is idempotent. Skips cleanly when no DB is reachable (CI has no
// Postgres). The throwaway schema clones the live universe tables (LIKE …
// INCLUDING ALL) so the test exercises the real column/PK shapes.

const harness = await createDbTestHarness({
  schema: 'test_universe_emit',
  tables: [
    'eve_regions',
    'eve_constellations',
    'eve_solar_systems',
    'eve_station_operations',
    'eve_npc_stations',
    'eve_system_jumps',
  ],
});

// A small slice of the real universe: Jita + a neighbour (K-space, a gate between
// them), a regular C1 wormhole system, and Thera with an industry station.
const DATASET: UniverseDataset = {
  regions: [
    { id: 10000002, name: 'The Forge' },
    { id: 11000001, name: 'A-R00001' },
    { id: 11000031, name: 'G-R00031' },
  ],
  constellations: [
    { id: 20000020, regionId: 10000002, name: 'Kimotoro' },
    { id: 21000311, regionId: 11000001, name: 'A-C00001' },
    { id: 21000324, regionId: 11000031, name: 'Thera constellation' },
  ],
  systems: [
    { id: 30000142, constellationId: 20000020, regionId: 10000002, name: 'Jita', securityStatus: 0.946, wormholeClassId: 7 },
    { id: 30000144, constellationId: 20000020, regionId: 10000002, name: 'Perimeter', securityStatus: 0.946, wormholeClassId: 7 },
    { id: 31000007, constellationId: 21000311, regionId: 11000001, name: 'J105443', securityStatus: -0.99, wormholeClassId: 1 },
    { id: 31000005, constellationId: 21000324, regionId: 11000031, name: 'Thera', securityStatus: -1, wormholeClassId: 12 },
  ],
  jumps: [
    { fromSystemId: 30000142, toSystemId: 30000144 },
    { fromSystemId: 30000144, toSystemId: 30000142 },
  ],
  operations: [{ id: 14, name: 'Assembly Plant' }],
  stations: [
    { id: 60015148, solarSystemId: 31000005, operationId: 14, typeId: 1531, ownerId: 1000035, manufacturingCapable: true, researchCapable: true, industryCapable: true },
  ],
};

describe.skipIf(!harness.reachable)('emitUniverseNeon executes against Postgres', () => {
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await emitUniverseNeon(harness.db as any, DATASET);
  });

  it('reads back a J-space system with its derived wormhole class', async () => {
    const rows = await harness.db
      .select({ name: eveSolarSystems.name, cls: eveSolarSystems.wormholeClassId })
      .from(eveSolarSystems)
      .where(eq(eveSolarSystems.id, 31000007));
    expect(rows).toEqual([{ name: 'J105443', cls: 1 }]);
  });

  it('keeps Thera\'s industry station (J-space system now ingested)', async () => {
    const rows = await harness.db
      .select({ id: eveNpcStations.id, industry: eveNpcStations.industryCapable })
      .from(eveNpcStations)
      .where(eq(eveNpcStations.solarSystemId, 31000005));
    expect(rows).toEqual([{ id: 60015148, industry: true }]);
  });

  it('writes the jump graph and every endpoint resolves to a system (FK integrity)', async () => {
    const { jumps } = (await harness.db.execute<{ jumps: number }>(
      sql`SELECT COUNT(*)::int AS jumps FROM eve_system_jumps`,
    ))[0]!;
    expect(jumps).toBe(2);

    const { orphans } = (await harness.db.execute<{ orphans: number }>(sql`
      SELECT COUNT(*)::int AS orphans FROM eve_system_jumps j
      WHERE NOT EXISTS (SELECT 1 FROM eve_solar_systems s WHERE s.id = j.from_system_id)
         OR NOT EXISTS (SELECT 1 FROM eve_solar_systems s WHERE s.id = j.to_system_id)
    `))[0]!;
    expect(orphans).toBe(0);
  });

  it('is idempotent on re-emit (truncate + refill)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = await emitUniverseNeon(harness.db as any, DATASET);
    expect(summary).toMatchObject({
      regionsWritten: 3,
      systemsWritten: 4,
      systemJumpsWritten: 2,
      npcStationsWritten: 1,
    });
    const { systems } = (await harness.db.execute<{ systems: number }>(
      sql`SELECT COUNT(*)::int AS systems FROM eve_solar_systems`,
    ))[0]!;
    expect(systems).toBe(4);
  });
});
