import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import {
  whStaticsSnapshots,
  whSystemStatics,
} from './schema';

const SCHEMA = 'test_wh_statics_schema';
const harness = await createDbTestHarness({
  schema: SCHEMA,
  tables: ['wh_statics_snapshots', 'wh_system_statics'],
  foreignKeys: [
    {
      table: 'wh_system_statics',
      column: 'source_snapshot_id',
      refTable: 'wh_statics_snapshots',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)(
  'wormhole statics schema (real Postgres)',
  () => {
    it('reflects the holding pen and promoted copy with their key shapes', async () => {
      const columns = await harness.sql<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: 'YES' | 'NO';
      }[]>`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = ${SCHEMA}
          AND table_name IN ('wh_statics_snapshots', 'wh_system_statics')
        ORDER BY table_name, ordinal_position
      `;

      expect(columns).toEqual([
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'id',
          data_type: 'bigint',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'feed_version',
          data_type: 'text',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'etag',
          data_type: 'text',
          is_nullable: 'YES',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'last_modified',
          data_type: 'text',
          is_nullable: 'YES',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'digest',
          data_type: 'text',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'system_count',
          data_type: 'integer',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'status',
          data_type: 'USER-DEFINED',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'entries',
          data_type: 'jsonb',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'difference',
          data_type: 'jsonb',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'cross_check',
          data_type: 'jsonb',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_statics_snapshots',
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_system_statics',
          column_name: 'system_id',
          data_type: 'bigint',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_system_statics',
          column_name: 'code',
          data_type: 'text',
          is_nullable: 'NO',
        },
        {
          table_name: 'wh_system_statics',
          column_name: 'source_snapshot_id',
          data_type: 'bigint',
          is_nullable: 'NO',
        },
      ]);

      const constraints = await harness.sql<{
        table_name: string;
        column_name: string;
        constraint_type: string;
        foreign_table_name: string | null;
      }[]>`
        SELECT
          tc.table_name,
          kcu.column_name,
          tc.constraint_type,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_schema = kcu.constraint_schema
          AND tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_schema = ccu.constraint_schema
          AND tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_schema = ${SCHEMA}
          AND tc.table_name IN ('wh_statics_snapshots', 'wh_system_statics')
          AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
        ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position
      `;

      expect(constraints).toEqual(
        expect.arrayContaining([
          {
            table_name: 'wh_statics_snapshots',
            column_name: 'id',
            constraint_type: 'PRIMARY KEY',
            foreign_table_name: 'wh_statics_snapshots',
          },
          {
            table_name: 'wh_system_statics',
            column_name: 'system_id',
            constraint_type: 'PRIMARY KEY',
            foreign_table_name: 'wh_system_statics',
          },
          {
            table_name: 'wh_system_statics',
            column_name: 'code',
            constraint_type: 'PRIMARY KEY',
            foreign_table_name: 'wh_system_statics',
          },
          {
            table_name: 'wh_system_statics',
            column_name: 'source_snapshot_id',
            constraint_type: 'FOREIGN KEY',
            foreign_table_name: 'wh_statics_snapshots',
          },
        ]),
      );
    });

    it('persists the enum default and composite promoted-copy key', async () => {
      const [snapshot] = await harness.db
        .insert(whStaticsSnapshots)
        .values({
          feedVersion: '11',
          etag: '"fixture"',
          digest: 'sha256:fixture',
          systemCount: 1,
          entries: [{ systemId: 31_002_318, systemName: 'J111613', code: 'E175' }],
          difference: { totalDifferences: 1 },
          crossCheck: { agreedSystems: 1 },
        })
        .returning({
          id: whStaticsSnapshots.id,
          status: whStaticsSnapshots.status,
        });

      expect(snapshot?.status).toBe('pending');
      if (snapshot === undefined) {
        throw new Error('Snapshot insert returned no row');
      }
      await harness.db.insert(whSystemStatics).values({
        systemId: 31_002_318,
        code: 'E175',
        sourceSnapshotId: snapshot.id,
      });
      await expect(
        harness.db.insert(whSystemStatics).values({
          systemId: 31_002_318,
          code: 'E175',
          sourceSnapshotId: snapshot.id,
        }),
      ).rejects.toThrow();
    });
  },
);
