import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedUser,
} from '@/db/test-support/db-test-harness';
import { mapAccess, maps } from './schema';
import { mapsPurgeContributor } from './purge';

const harness = await createDbTestHarness({
  schema: 'test_maps_purge',
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
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('maps purge contributor (real Postgres)', () => {
  it('removes one character grant while preserving corporation and other-character grants', async () => {
    await seedUser(harness.db, 'owner');
    await harness.db.insert(maps).values({ id: '11111111-1111-4111-8111-111111111111', userId: 'owner', name: 'Map' });
    await harness.db.insert(mapAccess).values([
      {
        mapId: '11111111-1111-4111-8111-111111111111',
        ownerType: 'character',
        ownerId: 42,
        role: 'editor',
      },
      {
        mapId: '11111111-1111-4111-8111-111111111111',
        ownerType: 'character',
        ownerId: 43,
        role: 'viewer',
      },
      {
        mapId: '11111111-1111-4111-8111-111111111111',
        ownerType: 'corporation',
        ownerId: 99,
        role: 'viewer',
      },
    ]);

    await mapsPurgeContributor.purgeCharacter?.({
      kind: 'character',
      userId: 'owner',
      characterId: 42,
    });

    expect(
      await harness.db.select().from(mapAccess).orderBy(asc(mapAccess.ownerId)),
    ).toMatchObject([
      { ownerType: 'character', ownerId: 43 },
      { ownerType: 'corporation', ownerId: 99 },
    ]);
  });

  it('removes a user-owned map and its grants while leaving another owner intact', async () => {
    await seedUser(harness.db, 'owner');
    await seedUser(harness.db, 'other');
    await harness.db.insert(maps).values([
      { id: '11111111-1111-4111-8111-111111111111', userId: 'owner', name: 'Owned' },
      { id: '22222222-2222-4222-8222-222222222222', userId: 'other', name: 'Other' },
    ]);
    await harness.db.insert(mapAccess).values([
      {
        mapId: '11111111-1111-4111-8111-111111111111',
        ownerType: 'character',
        ownerId: 42,
        role: 'editor',
      },
      {
        mapId: '22222222-2222-4222-8222-222222222222',
        ownerType: 'character',
        ownerId: 43,
        role: 'viewer',
      },
    ]);

    await mapsPurgeContributor.purgeUser?.({ kind: 'user', userId: 'owner' });

    expect(await harness.db.select().from(maps).where(eq(maps.userId, 'owner'))).toHaveLength(0);
    expect(await harness.db.select().from(maps).where(eq(maps.userId, 'other'))).toHaveLength(1);
    expect(
      await harness.db.select().from(mapAccess).orderBy(asc(mapAccess.ownerId)),
    ).toMatchObject([
      { ownerId: 43, mapId: '22222222-2222-4222-8222-222222222222' },
    ]);
  });
});
