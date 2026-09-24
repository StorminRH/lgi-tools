import { asc, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { createMapsPurgeContributor } from './purge';
import { mapAccess, maps, pendingMapAccessChanges } from './schema';

const hooks = {
  deliverCaptured: vi.fn(),
  purgeMapChain: vi.fn(),
  purgeUserClaims: vi.fn(),
};

const mapsPurgeContributor = createMapsPurgeContributor(hooks);

const harness = await createDbTestHarness({
  schema: 'test_maps_purge',
  tables: ['user', 'characters', 'maps', 'map_access', 'map_access_changes'],
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
    {
      table: 'map_access_changes',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

beforeEach(() => {
  vi.clearAllMocks();
  hooks.deliverCaptured.mockResolvedValue(undefined);
  hooks.purgeMapChain.mockResolvedValue(undefined);
  hooks.purgeUserClaims.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
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
    expect(hooks.deliverCaptured).toHaveBeenCalledWith([
      expect.objectContaining({
        mapId: '11111111-1111-4111-8111-111111111111',
        version: expect.any(String),
      }),
    ]);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([
      expect.objectContaining({
        mapId: '11111111-1111-4111-8111-111111111111',
        version: expect.any(String),
      }),
    ]);
  });

  it('re-projects corp-grant maps when the departing character matched that corp', async () => {
    await seedUser(harness.db, 'owner');
    await seedCharacter(harness.db, 42, { corporationId: 99 });
    await harness.db.insert(maps).values([
      { id: '11111111-1111-4111-8111-111111111111', userId: 'owner', name: 'Char map' },
      { id: '22222222-2222-4222-8222-222222222222', userId: 'owner', name: 'Corp map' },
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

    const pending = hooks.deliverCaptured.mock.calls[0]?.[0] ?? [];
    expect(pending.map((row: { mapId: string }) => row.mapId).sort()).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toHaveLength(2);
  });

  it('removes a user-owned map and tears down then purges user claims', async () => {
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
    expect(hooks.purgeMapChain).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(hooks.purgeUserClaims).toHaveBeenCalledWith('owner');
  });

  it('completes purge and keeps durable retry work when captured delivery fails after the grant delete', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    hooks.deliverCaptured.mockRejectedValue(new Error('door down'));
    await seedUser(harness.db, 'owner');
    await harness.db.insert(maps).values({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'owner',
      name: 'Map',
    });
    await harness.db.insert(mapAccess).values({
      mapId: '11111111-1111-4111-8111-111111111111',
      ownerType: 'character',
      ownerId: 42,
      role: 'editor',
    });

    await expect(
      mapsPurgeContributor.purgeCharacter?.({
        kind: 'character',
        userId: 'owner',
        characterId: 42,
      }),
    ).resolves.toBeUndefined();

    expect(await harness.db.select().from(mapAccess)).toEqual([]);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([
      expect.objectContaining({
        mapId: '11111111-1111-4111-8111-111111111111',
        version: expect.any(String),
      }),
    ]);
  });

  it('rolls character-grant deletes back when the durable queue write fails', async () => {
    await seedUser(harness.db, 'owner');
    await harness.db.insert(maps).values({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'owner',
      name: 'Map',
    });
    await harness.db.insert(mapAccess).values({
      mapId: '11111111-1111-4111-8111-111111111111',
      ownerType: 'character',
      ownerId: 42,
      role: 'editor',
    });
    await harness.db.execute(sql`
      ALTER TABLE map_access_changes ADD CONSTRAINT reject_test_queue CHECK (false)
    `);
    try {
      await expect(
        mapsPurgeContributor.purgeCharacter?.({
          kind: 'character',
          userId: 'owner',
          characterId: 42,
        }),
      ).rejects.toThrow();
      expect(await harness.db.select().from(mapAccess)).toEqual([
        expect.objectContaining({ ownerType: 'character', ownerId: 42 }),
      ]);
      expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([]);
      expect(hooks.deliverCaptured).not.toHaveBeenCalled();
    } finally {
      await harness.db.execute(sql`
        ALTER TABLE map_access_changes DROP CONSTRAINT reject_test_queue
      `);
    }
  });

  it('keeps owned Neon maps retryable when collaborative purge fails', async () => {
    hooks.purgeMapChain.mockRejectedValueOnce(new Error('door down'));
    await seedUser(harness.db, 'owner');
    await harness.db.insert(maps).values({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'owner',
      name: 'Map',
    });

    await expect(
      mapsPurgeContributor.purgeUser?.({ kind: 'user', userId: 'owner' }),
    ).rejects.toThrow('door down');
    await expect(
      harness.db.select().from(maps).where(eq(maps.userId, 'owner')),
    ).resolves.toHaveLength(1);
  });
});
