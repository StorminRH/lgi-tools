import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { account } from '@/db/auth-schema';
import {
  compensateFailedMapCreation,
  createMapAtomic,
  listAuthorizedMapsForPrincipals,
  publishCreatedMap,
} from '@/data/maps/queries';
import { mapAccess, maps } from '@/data/maps/schema';
import { createProjectedMap } from './map-creation';
import { computeMapAccessClaims } from './map-access-projection';

const PROJECTION_RESULT = {
  inserted: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  outcome: 'applied' as const,
};

const harness = await createDbTestHarness({
  schema: 'test_map_creation',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_blocks', 'map_block_accounts'],
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
      table: 'map_blocks',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_block_accounts',
      column: 'block_id',
      refTable: 'map_blocks',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('map creation compensation (real Postgres)', () => {
  it('publishes a successfully projected staged map', async () => {
    await seedUser(harness.db, 'creator');
    const project = vi.fn().mockResolvedValue(PROJECTION_RESULT);

    const result = await createProjectedMap(
      'creator',
      {
        name: 'Projected chain',
        creatorCharacterIds: [7],
        grants: [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
      },
      {
        listLinkedCharacterIds: async () => [7],
        createMap: (userId, name, grants) =>
          createMapAtomic(userId, name, grants, harness.db),
        compensate: (mapId) => compensateFailedMapCreation(mapId, harness.db),
        publish: (mapId) => publishCreatedMap(mapId, harness.db),
        project,
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(project).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const [stored] = await harness.db.select().from(maps);
    expect(stored).toMatchObject({
      archivedAt: null,
      purgeRequestedAt: null,
      tombstonedAt: null,
      lifecycleStatus: 'active',
      characterScopedAt: expect.any(Date),
    });
    const grants = await harness.db.select().from(mapAccess);
    expect(grants.map(({ ownerType, ownerId, role }) => ({ ownerType, ownerId, role }))).toEqual([
      { ownerType: 'character', ownerId: 7, role: 'viewer' },
      { ownerType: 'character', ownerId: 42, role: 'editor' },
    ]);
  });

  it('keeps Admin with the creator user when a selected character unlinks and gets a new holder', async () => {
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'buyer');
    await seedCharacter(harness.db, 7, { name: 'Creator Scout' });
    await seedEveAccount(harness.db, { id: 'creator-7', userId: 'creator', characterId: 7 }, { refreshToken: 'valid' });
    const result = await createProjectedMap('creator', {
      name: 'Creator tracking', creatorCharacterIds: [7], grants: [],
    }, {
      listLinkedCharacterIds: async () => [7],
      createMap: (userId, name, grants) => createMapAtomic(userId, name, grants, harness.db),
      publish: (mapId) => publishCreatedMap(mapId, harness.db),
      project: vi.fn().mockResolvedValue(PROJECTION_RESULT),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Map creation failed');
    await expect(computeMapAccessClaims(result.mapId)).resolves.toEqual([
      { userId: 'creator', roles: ['admin'], characters: [{ characterId: 7, name: 'Creator Scout' }] },
    ]);
    await harness.db.delete(account).where(eq(account.id, 'creator-7'));
    await seedEveAccount(harness.db, { id: 'buyer-7', userId: 'buyer', characterId: 7 }, { refreshToken: 'valid' });
    await expect(computeMapAccessClaims(result.mapId)).resolves.toEqual([
      { userId: 'buyer', roles: ['viewer'], characters: [{ characterId: 7, name: 'Creator Scout' }] },
      { userId: 'creator', roles: ['admin'], characters: [] },
    ]);
  });

  it('leaves no map or grant after creation exhausts projection attempts', async () => {
    await seedUser(harness.db, 'creator');
    let now = 0;
    const project = vi.fn().mockRejectedValue(new Error('projection unavailable'));

    await expect(
      createProjectedMap(
        'creator',
        {
          name: 'Compensated chain',
          creatorCharacterIds: [7],
          grants: [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
        },
        {
          listLinkedCharacterIds: async () => [7],
          createMap: (userId, name, grants) =>
            createMapAtomic(userId, name, grants, harness.db),
          compensate: (mapId) => compensateFailedMapCreation(mapId, harness.db),
          project,
          teardown: vi.fn().mockResolvedValue(PROJECTION_RESULT),
          now: () => now,
          pause: async (delayMs) => {
            now += delayMs;
          },
        },
      ),
    ).resolves.toMatchObject({ ok: false });

    expect(project).toHaveBeenCalledTimes(4);
    await expect(harness.db.select().from(maps)).resolves.toEqual([]);
    await expect(harness.db.select().from(mapAccess)).resolves.toEqual([]);
  });

  it('keeps failed compensation hidden with durable purge intent', async () => {
    await seedUser(harness.db, 'creator');

    const result = await createProjectedMap(
      'creator',
      { name: 'Queued recovery', creatorCharacterIds: [7], grants: [] },
      {
        listLinkedCharacterIds: async () => [7],
        createMap: (userId, name, grants) =>
          createMapAtomic(userId, name, grants, harness.db),
        compensate: vi.fn().mockRejectedValue(new Error('database unavailable')),
        publish: (mapId) => publishCreatedMap(mapId, harness.db),
        project: vi.fn().mockRejectedValue(new Error('projection unavailable')),
        teardown: vi.fn().mockResolvedValue(PROJECTION_RESULT),
        now: vi.fn().mockReturnValue(0),
        pause: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result).toMatchObject({ ok: false, cleanup: 'queued' });
    const [stored] = await harness.db.select().from(maps);
    expect(stored).toMatchObject({
      archivedAt: expect.any(Date),
      purgeRequestedAt: expect.any(Date),
      tombstonedAt: null,
      lifecycleStatus: 'purge_queued',
    });
    await expect(
      listAuthorizedMapsForPrincipals(
        'creator',
        { characterIds: [], corporationIds: [] },
        harness.db,
      ),
    ).resolves.toEqual([]);
  });
});
