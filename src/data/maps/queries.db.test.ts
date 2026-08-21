import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { account } from '@/db/auth-schema';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import {
  applyAuthorizedMapGrantChange,
  compensateFailedMapCreation,
  createMapAtomic,
  getAuthorizedMapGrantsForMaps,
  getUserIdsInCorporations,
  getUserIdsOwningCharacters,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
} from './queries';
import { mapAccess, maps } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_maps_queries',
  tables: ['user', 'account', 'characters', 'maps', 'map_access'],
  foreignKeys: [
    {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
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

describe.skipIf(!harness.reachable)('maps candidate queries (real Postgres)', () => {
  it('resolves EVE-provider owners by character id and ignores non-EVE rows', async () => {
    await seedUser(harness.db, 'owner');
    await seedUser(harness.db, 'other');
    await seedEveAccount(harness.db, { id: 'acc-1', characterId: 42, userId: 'owner' });
    await seedEveAccount(harness.db, { id: 'acc-2', characterId: 43, userId: 'other' });
    await harness.db.insert(account).values({
      id: 'acc-discord',
      accountId: 'discord-user-not-numeric',
      providerId: 'discord',
      userId: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(getUserIdsOwningCharacters([42, 43, 99])).resolves.toEqual(
      new Map([
        [42, 'owner'],
        [43, 'other'],
      ]),
    );
  });

  it('returns an empty map without querying when character ids are empty', async () => {
    await expect(getUserIdsOwningCharacters([])).resolves.toEqual(new Map());
  });

  it('resolves users with a linked character in granted corporations', async () => {
    await seedUser(harness.db, 'member');
    await seedUser(harness.db, 'outsider');
    await seedCharacter(harness.db, 42, { corporationId: 990 });
    await seedCharacter(harness.db, 43, { corporationId: 991 });
    await seedEveAccount(harness.db, { id: 'acc-1', characterId: 42, userId: 'member' });
    await seedEveAccount(harness.db, { id: 'acc-2', characterId: 43, userId: 'outsider' });

    await expect(getUserIdsInCorporations([990])).resolves.toEqual(new Set(['member']));
  });

  it('returns an empty set without querying when corporation ids are empty', async () => {
    await expect(getUserIdsInCorporations([])).resolves.toEqual(new Set());
  });

  it('creates a map and selected grants in one statement, including a private map', async () => {
    await seedUser(harness.db, 'creator');
    const grantedMapId = await createMapAtomic(
      'creator',
      'Shared chain',
      [
        { ownerType: 'character', ownerId: 42, role: 'editor' },
        { ownerType: 'corporation', ownerId: 99, role: 'viewer' },
      ],
      harness.db,
    );
    const privateMapId = await createMapAtomic('creator', 'Private chain', [], harness.db);

    const storedMaps = await harness.db.select().from(maps);
    expect(storedMaps).toHaveLength(2);
    expect(storedMaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ archivedAt: expect.any(Date), purgeRequestedAt: expect.any(Date) }),
      ]),
    );
    await expect(harness.db.select().from(mapAccess)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mapId: grantedMapId, ownerType: 'character', ownerId: 42, role: 'editor' }),
        expect.objectContaining({ mapId: grantedMapId, ownerType: 'corporation', ownerId: 99, role: 'viewer' }),
      ]),
    );
    await expect(
      harness.db.select().from(mapAccess).where(eq(mapAccess.mapId, privateMapId)),
    ).resolves.toEqual([]);
  });

  it('leaves no durable row when grant insertion fails inside the create statement', async () => {
    await seedUser(harness.db, 'creator');

    await expect(
      createMapAtomic(
        'creator',
        'Must roll back',
        [
          { ownerType: 'character', ownerId: 42, role: 'viewer' },
          { ownerType: 'character', ownerId: 42, role: 'editor' },
        ],
        harness.db,
      ),
    ).rejects.toThrow();
    await expect(harness.db.select().from(maps)).resolves.toEqual([]);
    await expect(harness.db.select().from(mapAccess)).resolves.toEqual([]);
  });

  it('lists live authorized maps once with deterministic provenance ordering', async () => {
    const base = new Date('2026-08-12T12:00:00.000Z');
    await seedUser(harness.db, 'creator', { name: 'Creator' });
    await seedUser(harness.db, 'viewer', { name: 'Viewer' });
    await harness.db.insert(maps).values([
      { id: '10000000-0000-4000-8000-000000000001', userId: 'viewer', name: 'Created', createdAt: new Date(base.getTime() - 30_000) },
      { id: '10000000-0000-4000-8000-000000000002', userId: 'creator', name: 'Corporation', createdAt: new Date(base.getTime() - 20_000) },
      { id: '10000000-0000-4000-8000-000000000003', userId: 'creator', name: 'Direct', createdAt: new Date(base.getTime() - 10_000) },
      { id: '10000000-0000-4000-8000-000000000004', userId: 'creator', name: 'Archived', archivedAt: base },
      { id: '10000000-0000-4000-8000-000000000005', userId: 'creator', name: 'Tombstoned', tombstonedAt: base },
    ]);
    await harness.db.insert(mapAccess).values([
      { mapId: '10000000-0000-4000-8000-000000000002', ownerType: 'corporation', ownerId: 99, role: 'viewer' },
      { mapId: '10000000-0000-4000-8000-000000000002', ownerType: 'character', ownerId: 42, role: 'editor' },
      { mapId: '10000000-0000-4000-8000-000000000003', ownerType: 'character', ownerId: 42, role: 'editor' },
      { mapId: '10000000-0000-4000-8000-000000000004', ownerType: 'character', ownerId: 42, role: 'editor' },
      { mapId: '10000000-0000-4000-8000-000000000005', ownerType: 'character', ownerId: 42, role: 'editor' },
    ]);

    const rows = await listAuthorizedMapsForPrincipals(
      'viewer',
      { characterIds: [42], corporationIds: [99] },
      harness.db,
    );
    expect(rows.map(({ name, role, provenance }) => ({ name, role, provenance }))).toEqual([
      { name: 'Created', role: 'admin', provenance: { kind: 'created' } },
      { name: 'Corporation', role: 'editor', provenance: { kind: 'corporation', corporationIds: [99] } },
      { name: 'Direct', role: 'editor', provenance: { kind: 'direct', characterIds: [42] } },
    ]);
  });

  it('lists only in-grace archived maps for principals with admin authority', async () => {
    const now = new Date('2026-08-12T12:00:00.000Z');
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'viewer');
    await harness.db.insert(maps).values([
      { id: '20000000-0000-4000-8000-000000000001', userId: 'viewer', name: 'Created', archivedAt: new Date(now.getTime() - 1_000) },
      { id: '20000000-0000-4000-8000-000000000002', userId: 'creator', name: 'Delegated admin', archivedAt: new Date(now.getTime() - 2_000) },
      { id: '20000000-0000-4000-8000-000000000003', userId: 'creator', name: 'Viewer only', archivedAt: new Date(now.getTime() - 3_000) },
      { id: '20000000-0000-4000-8000-000000000004', userId: 'creator', name: 'Expired', archivedAt: new Date('2026-06-01T00:00:00.000Z') },
      { id: '20000000-0000-4000-8000-000000000005', userId: 'creator', name: 'Purge requested', archivedAt: new Date(now.getTime() - 4_000), purgeRequestedAt: now },
      { id: '20000000-0000-4000-8000-000000000006', userId: 'creator', name: 'Tombstoned', archivedAt: new Date(now.getTime() - 5_000), tombstonedAt: now },
    ]);
    await harness.db.insert(mapAccess).values([
      { mapId: '20000000-0000-4000-8000-000000000002', ownerType: 'character', ownerId: 42, role: 'admin' },
      { mapId: '20000000-0000-4000-8000-000000000003', ownerType: 'character', ownerId: 42, role: 'viewer' },
      { mapId: '20000000-0000-4000-8000-000000000004', ownerType: 'character', ownerId: 42, role: 'admin' },
      { mapId: '20000000-0000-4000-8000-000000000005', ownerType: 'character', ownerId: 42, role: 'admin' },
      { mapId: '20000000-0000-4000-8000-000000000006', ownerType: 'character', ownerId: 42, role: 'admin' },
    ]);

    const rows = await listDeletedRestorableMapsForPrincipals(
      'viewer',
      { characterIds: [42], corporationIds: [] },
      harness.db,
      now,
    );
    expect(rows.map(({ name, role, provenance }) => ({ name, role, provenance }))).toEqual([
      { name: 'Created', role: 'admin', provenance: { kind: 'created' } },
      { name: 'Delegated admin', role: 'admin', provenance: { kind: 'direct', characterIds: [42] } },
    ]);
  });

  it('compensation deletes the just-created map and cascading grants', async () => {
    await seedUser(harness.db, 'creator');
    const mapId = await createMapAtomic(
      'creator',
      'Projection failed',
      [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
      harness.db,
    );

    await compensateFailedMapCreation(mapId, harness.db);
    await expect(harness.db.select().from(maps)).resolves.toEqual([]);
    await expect(harness.db.select().from(mapAccess)).resolves.toEqual([]);
  });

  it('upserts and revokes only the exact delegated principal', async () => {
    await seedUser(harness.db, 'creator');
    const mapId = '30000000-0000-4000-8000-000000000001';
    await harness.db.insert(maps).values({
      id: mapId,
      userId: 'creator',
      name: 'Managed chain',
    });
    await harness.db.insert(mapAccess).values([
      { mapId, ownerType: 'character', ownerId: 42, role: 'viewer' },
      { mapId, ownerType: 'corporation', ownerId: 99, role: 'viewer' },
    ]);

    const upsert = {
      operation: 'upsert' as const,
      grant: { ownerType: 'character' as const, ownerId: 42, role: 'admin' as const },
    };
    await expect(
      applyAuthorizedMapGrantChange(
        'creator',
        { characterIds: [], corporationIds: [] },
        mapId,
        upsert,
        harness.db,
      ),
    ).resolves.toBe(true);
    await expect(
      applyAuthorizedMapGrantChange(
        'creator',
        { characterIds: [], corporationIds: [] },
        mapId,
        upsert,
        harness.db,
      ),
    ).resolves.toBe(true);
    await applyAuthorizedMapGrantChange(
      'creator',
      { characterIds: [], corporationIds: [] },
      mapId,
      {
        operation: 'revoke',
        principal: { ownerType: 'corporation', ownerId: 99 },
      },
      harness.db,
    );

    await expect(
      applyAuthorizedMapGrantChange(
        'delegated-admin',
        { characterIds: [42], corporationIds: [] },
        mapId,
        {
          operation: 'upsert',
          grant: { ownerType: 'character', ownerId: 7, role: 'viewer' },
        },
        harness.db,
      ),
    ).resolves.toBe(true);

    await expect(
      harness.db.select().from(mapAccess).where(eq(mapAccess.mapId, mapId)),
    ).resolves.toEqual([
      expect.objectContaining({
        ownerType: 'character',
        ownerId: 42,
        role: 'admin',
      }),
      expect.objectContaining({
        ownerType: 'character',
        ownerId: 7,
        role: 'viewer',
      }),
    ]);

    await harness.db.update(maps).set({ archivedAt: new Date() }).where(eq(maps.id, mapId));
    await expect(
      applyAuthorizedMapGrantChange(
        'creator',
        { characterIds: [], corporationIds: [] },
        mapId,
        {
          operation: 'upsert',
          grant: { ownerType: 'character', ownerId: 8, role: 'viewer' },
        },
        harness.db,
      ),
    ).resolves.toBe(false);
    await harness.db
      .update(maps)
      .set({ archivedAt: null, tombstonedAt: new Date() })
      .where(eq(maps.id, mapId));
    await expect(
      applyAuthorizedMapGrantChange(
        'creator',
        { characterIds: [], corporationIds: [] },
        mapId,
        {
          operation: 'revoke',
          principal: { ownerType: 'character', ownerId: 7 },
        },
        harness.db,
      ),
    ).resolves.toBe(false);
    await expect(
      harness.db.select().from(mapAccess).where(eq(mapAccess.mapId, mapId)),
    ).resolves.toHaveLength(2);
    await expect(
      harness.db.select().from(maps).where(eq(maps.id, mapId)),
    ).resolves.toHaveLength(1);
  });

  it('reads management grants only while current active-map admin authority holds', async () => {
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'delegated');
    await harness.db.insert(maps).values([
      {
        id: '31000000-0000-4000-8000-000000000001',
        userId: 'creator',
        name: 'Alpha',
      },
      {
        id: '31000000-0000-4000-8000-000000000002',
        userId: 'delegated',
        name: 'Bravo',
      },
      {
        id: '31000000-0000-4000-8000-000000000003',
        userId: 'creator',
        name: 'Viewer only',
      },
    ]);
    await harness.db.insert(mapAccess).values([
      {
        mapId: '31000000-0000-4000-8000-000000000001',
        ownerType: 'character',
        ownerId: 42,
        role: 'admin',
      },
      {
        mapId: '31000000-0000-4000-8000-000000000002',
        ownerType: 'corporation',
        ownerId: 99,
        role: 'viewer',
      },
      {
        mapId: '31000000-0000-4000-8000-000000000003',
        ownerType: 'corporation',
        ownerId: 99,
        role: 'viewer',
      },
    ]);

    await expect(
      getAuthorizedMapGrantsForMaps(
        'delegated',
        { characterIds: [42], corporationIds: [99] },
        [
          '31000000-0000-4000-8000-000000000001',
          '31000000-0000-4000-8000-000000000002',
          '31000000-0000-4000-8000-000000000003',
        ],
        harness.db,
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mapId: '31000000-0000-4000-8000-000000000001',
          ownerId: 42,
        }),
        expect.objectContaining({
          mapId: '31000000-0000-4000-8000-000000000002',
          ownerId: 99,
        }),
      ]),
    );
    const listed = await getAuthorizedMapGrantsForMaps(
      'delegated',
      { characterIds: [42], corporationIds: [99] },
      [
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000003',
      ],
      harness.db,
    );
    expect(listed.some((grant) => grant.mapId.endsWith('0003'))).toBe(false);

    await harness.db
      .update(mapAccess)
      .set({ role: 'viewer' })
      .where(
        and(
          eq(mapAccess.mapId, '31000000-0000-4000-8000-000000000001'),
          eq(mapAccess.ownerType, 'character'),
          eq(mapAccess.ownerId, 42),
        ),
      );
    await expect(
      getAuthorizedMapGrantsForMaps(
        'delegated',
        { characterIds: [42], corporationIds: [99] },
        ['31000000-0000-4000-8000-000000000001'],
        harness.db,
      ),
    ).resolves.toEqual([]);
    await expect(
      getAuthorizedMapGrantsForMaps(
        'delegated',
        { characterIds: [42], corporationIds: [99] },
        [],
        harness.db,
      ),
    ).resolves.toEqual([]);
  });

});
