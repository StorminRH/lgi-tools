import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';

const SCHEMA = 'test_wh_statics_schema';
const harness = await createDbTestHarness({
  schema: SCHEMA,
  tables: ['wh_statics_snapshots', 'wh_system_statics'],
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('wh-statics schema (real Postgres)', () => {
  it('reflects both tables with their columns, keys, and status enum', async () => {
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
        data_type: 'integer',
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
      {
        table_name: 'wh_system_statics',
        column_name: 'source_version',
        data_type: 'text',
        is_nullable: 'NO',
      },
    ]);

    const constraints = await harness.sql<{
      table_name: string;
      column_name: string;
      constraint_type: string;
    }[]>`
      SELECT
        tc.table_name,
        kcu.column_name,
        tc.constraint_type
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_schema = ${SCHEMA}
        AND tc.table_name IN ('wh_statics_snapshots', 'wh_system_statics')
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `;
    expect(constraints).toEqual([
      {
        table_name: 'wh_statics_snapshots',
        column_name: 'id',
        constraint_type: 'PRIMARY KEY',
      },
      {
        table_name: 'wh_system_statics',
        column_name: 'system_id',
        constraint_type: 'PRIMARY KEY',
      },
      {
        table_name: 'wh_system_statics',
        column_name: 'code',
        constraint_type: 'PRIMARY KEY',
      },
    ]);

    const enumValues = await harness.sql<{ enumlabel: string }[]>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = ${SCHEMA}
        AND t.typname = 'wh_statics_snapshot_status'
      ORDER BY e.enumsortorder
    `;
    expect(enumValues.map((row) => row.enumlabel)).toEqual([
      'pending',
      'promoted',
      'rejected',
      'superseded',
    ]);
  });
});
