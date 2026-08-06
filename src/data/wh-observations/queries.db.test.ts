import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { insertWhObservation } from './queries';
import { whObservations } from './schema';

const SCHEMA = 'test_wh_observations';
const harness = await createDbTestHarness({
  schema: SCHEMA,
  tables: ['wh_observations'],
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('wormhole observations (real Postgres)', () => {
  it('exposes only the five privacy-safe columns', async () => {
    const columns = await harness.sql<{
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
    }[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = ${SCHEMA}
        AND table_name = 'wh_observations'
      ORDER BY ordinal_position
    `;

    expect(columns).toEqual([
      {
        column_name: 'solar_system_id',
        data_type: 'bigint',
        is_nullable: 'NO',
      },
      {
        column_name: 'wh_type_code',
        data_type: 'character varying',
        is_nullable: 'NO',
      },
      {
        column_name: 'provenance',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
      },
      {
        column_name: 'observed_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      {
        column_name: 'dedupe_key',
        data_type: 'text',
        is_nullable: 'NO',
      },
    ]);
  });

  it('coarsens timestamps and corrects one deduplicated row in place', async () => {
    const firstInputAt = new Date('2026-08-06T14:37:42.123Z');
    const first = await insertWhObservation(harness.db, {
      solarSystemId: 31_000_001,
      whTypeCode: 'B274',
      provenance: 'jump-verified',
      observedAt: firstInputAt,
      dedupeKey: 'connection-lifetime-key',
    });

    expect(first.observedAt).toBeInstanceOf(Date);
    expect(first.observedAt.getTime()).toBe(
      new Date('2026-08-06T14:00:00.000Z').getTime(),
    );
    expect(firstInputAt.getTime()).toBe(
      new Date('2026-08-06T14:37:42.123Z').getTime(),
    );

    const corrected = await insertWhObservation(harness.db, {
      solarSystemId: 31_000_002,
      whTypeCode: 'C247',
      provenance: 'human',
      observedAt: new Date('2026-08-06T15:58:17.999Z'),
      dedupeKey: 'connection-lifetime-key',
    });
    const rows = await harness.db.select().from(whObservations);

    expect(rows).toHaveLength(1);
    expect(corrected).toEqual(rows[0]);
    expect(rows[0]).toMatchObject({
      solarSystemId: 31_000_002,
      whTypeCode: 'C247',
      provenance: 'human',
      dedupeKey: 'connection-lifetime-key',
    });
    expect(rows[0]?.observedAt).toBeInstanceOf(Date);
    expect(rows[0]?.observedAt.getTime()).toBe(
      new Date('2026-08-06T15:00:00.000Z').getTime(),
    );

    await expect(
      insertWhObservation(harness.db, {
        solarSystemId: 31_000_002,
        whTypeCode: 'K162',
        provenance: 'human',
        observedAt: new Date('2026-08-06T16:01:00.000Z'),
        dedupeKey: 'far-side-key',
      }),
    ).rejects.toThrow(/attributable type code/);
  });
});
