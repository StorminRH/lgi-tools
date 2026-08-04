import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { isKnownSpaceSystemId } from './wormhole-contract';

const harness = await createDbTestHarness({
  schema: 'test_wormhole_space_boundary',
  tables: ['eve_solar_systems'],
});

beforeAll(async () => {
  if (!harness.reachable) return;
  await harness.sql`
    INSERT INTO eve_solar_systems
    SELECT * FROM public.eve_solar_systems
  `;
});

describe.skipIf(!harness.reachable)('wormhole space boundary against the SDE mirror', () => {
  it('matches CCP system-ID ranges and pins the legacy Jove QA classes', async () => {
    const rows = await harness.sql<{
      id: number;
      wormhole_class_id: number | null;
      constellation_id: number;
      constellation_name: string;
    }[]>`
      SELECT
        system.id,
        system.wormhole_class_id,
        system.constellation_id,
        constellation.name AS constellation_name
      FROM eve_solar_systems AS system
      JOIN public.eve_constellations AS constellation
        ON constellation.id = system.constellation_id
      ORDER BY system.id
    `;
    const jSpaceClasses = new Set([1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18]);

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.filter(
        (row) =>
          isKnownSpaceSystemId(row.id) !==
          (row.id >= 30_000_000 && row.id < 31_000_000),
      ),
    ).toEqual([]);
    expect(
      rows
        .filter((row) => !isKnownSpaceSystemId(row.id))
        .filter((row) => !jSpaceClasses.has(row.wormhole_class_id ?? -1)),
    ).toEqual([]);
    expect(
      rows
        .filter((row) => row.wormhole_class_id === 10 || row.wormhole_class_id === 11)
        .map((row) => ({
          id: row.id,
          classId: row.wormhole_class_id,
          constellationId: row.constellation_id,
          constellationName: row.constellation_name,
        })),
    ).toEqual([
      ...Array.from({ length: 7 }, (_, index) => ({
        id: 30_000_420 + index,
        classId: 11,
        constellationId: 20_000_061,
        constellationName: 'B-HLOG',
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: 30_000_427 + index,
        classId: 10,
        constellationId: 20_000_062,
        constellationName: '0VFS-G',
      })),
    ]);
  });
});
