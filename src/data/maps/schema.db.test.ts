import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { archivedMapLifecycle } from './lifecycle-contract';
import { getMapAccessSubject, getMapGrants } from './queries';
import { mapAccess, maps } from './schema';

const SCHEMA = 'test_maps_schema';
const harness = await createDbTestHarness({
  schema: SCHEMA,
  tables: ['user', 'maps', 'map_access'],
  foreignKeys: [
    {
      table: 'maps',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_access',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('maps schema and queries (real Postgres)', () => {
  it('reflects both tables with their columns, keys, and grantee uniqueness', async () => {
    const columns = await harness.sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
    }[]>`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = ${SCHEMA}
        AND table_name IN ('maps', 'map_access')
      ORDER BY table_name, ordinal_position
    `;
    expect(columns).toEqual([
      { table_name: 'map_access', column_name: 'map_id', data_type: 'uuid', is_nullable: 'NO' },
      {
        table_name: 'map_access',
        column_name: 'owner_type',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
      },
      {
        table_name: 'map_access',
        column_name: 'owner_id',
        data_type: 'bigint',
        is_nullable: 'NO',
      },
      {
        table_name: 'map_access',
        column_name: 'role',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
      },
      {
        table_name: 'map_access',
        column_name: 'granted_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      { table_name: 'maps', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { table_name: 'maps', column_name: 'user_id', data_type: 'text', is_nullable: 'NO' },
      { table_name: 'maps', column_name: 'name', data_type: 'text', is_nullable: 'NO' },
      {
        table_name: 'maps',
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      {
        table_name: 'maps',
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      },
      {
        table_name: 'maps',
        column_name: 'archived_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        table_name: 'maps',
        column_name: 'tombstoned_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        table_name: 'maps',
        column_name: 'purge_requested_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        table_name: 'maps',
        column_name: 'purge_claimed_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        table_name: 'maps',
        column_name: 'lifecycle_status',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
      },
      {
        table_name: 'maps',
        column_name: 'lifecycle_entered_at',
        data_type: 'timestamp with time zone',
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
        AND tc.table_name IN ('maps', 'map_access')
        AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
      ORDER BY tc.table_name, tc.constraint_type, kcu.ordinal_position
    `;
    expect(constraints).toEqual(
      expect.arrayContaining([
        {
          table_name: 'maps',
          column_name: 'id',
          constraint_type: 'PRIMARY KEY',
          foreign_table_name: 'maps',
        },
        {
          table_name: 'maps',
          column_name: 'user_id',
          constraint_type: 'FOREIGN KEY',
          foreign_table_name: 'user',
        },
        {
          table_name: 'map_access',
          column_name: 'map_id',
          constraint_type: 'FOREIGN KEY',
          foreign_table_name: 'maps',
        },
      ]),
    );

    const [index] = await harness.sql<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = ${SCHEMA}
        AND tablename = 'map_access'
        AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    `;
    expect(index?.indexdef).toMatch(/\(map_id, owner_type, owner_id\)$/);
  });

  it('reads map identity and delegated grants through the slice queries', async () => {
    const mapId = randomUUID();
    await seedUser(harness.db, 'map-owner');
    await harness.db.insert(maps).values({ id: mapId, userId: 'map-owner', name: 'Home Chain' });
    await harness.db.insert(mapAccess).values([
      { mapId, ownerType: 'character', ownerId: 42, role: 'viewer' },
      { mapId, ownerType: 'corporation', ownerId: 99, role: 'editor' },
    ]);

    await expect(getMapAccessSubject(mapId, harness.db)).resolves.toMatchObject({
      userId: 'map-owner',
      archivedAt: null,
    });
    await expect(getMapGrants(mapId, harness.db)).resolves.toEqual([
      { ownerType: 'character', ownerId: 42, role: 'viewer' },
      { ownerType: 'corporation', ownerId: 99, role: 'editor' },
    ]);
  });

  it('rejects archived plus tombstoned on one row', async () => {
    await seedUser(harness.db, 'overlap-owner');
    const archivedAt = new Date('2026-08-12T00:00:00.000Z');
    await expect(
      harness.db.insert(maps).values({
        userId: 'overlap-owner',
        name: 'Overlap',
        ...archivedMapLifecycle(archivedAt),
        tombstonedAt: archivedAt,
      }),
    ).rejects.toThrow();
  });

  it('renames the legacy owner role without rewriting a seeded access row', async () => {
    await harness.sql.unsafe(
      `CREATE TYPE "${SCHEMA}".map_role AS ENUM ('viewer', 'editor', 'owner')`,
    );
    await harness.sql.unsafe(
      `ALTER TABLE "${SCHEMA}".map_access ALTER COLUMN role ` +
        `TYPE "${SCHEMA}".map_role USING role::text::"${SCHEMA}".map_role`,
    );

    const mapId = randomUUID();
    await seedUser(harness.db, 'extension-owner');
    await harness.db.insert(maps).values({ id: mapId, userId: 'extension-owner', name: 'Probe' });
    await harness.sql`
      INSERT INTO map_access (map_id, owner_type, owner_id, role)
      VALUES (${mapId}, 'character', 42, 'owner')
    `;
    const [before] = await harness.sql<{ ctid: string; role: string }[]>`
      SELECT ctid::text AS ctid, role::text AS role
      FROM map_access
      WHERE map_id = ${mapId}
    `;

    await harness.sql.unsafe(
      `ALTER TYPE "${SCHEMA}".map_role RENAME VALUE 'owner' TO 'admin'`,
    );
    const [after] = await harness.sql<{ ctid: string; role: string }[]>`
      SELECT ctid::text AS ctid, role::text AS role
      FROM map_access
      WHERE map_id = ${mapId}
    `;

    expect(after?.ctid).toBe(before?.ctid);
    expect(before?.role).toBe('owner');
    expect(after?.role).toBe('admin');
  });
});
