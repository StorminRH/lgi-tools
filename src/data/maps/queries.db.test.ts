import { and, eq, sql } from 'drizzle-orm';
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
  getMapAccessCandidateUserIds,
  affectedMapIdsForCharacter,
  enqueueAffectedMapAccessChanges,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
} from './queries';
import {
  archivedMapLifecycle,
  purgeQueuedMapLifecycle,
  tombstonedMapLifecycle,
} from './lifecycle-contract';
import { mapAccess, maps, pendingMapAccessChanges } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_maps_queries',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_access_changes'],
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
  it('discovers direct and corporation candidates once, including missing direct profiles', async () => {
    await seedUser(harness.db, 'member');
    await seedUser(harness.db, 'direct');
    await seedUser(harness.db, 'outsider');
    await seedCharacter(harness.db, 42, { corporationId: 990 });
    await seedCharacter(harness.db, 43, { corporationId: 990 });
    await seedCharacter(harness.db, 44, { corporationId: 991 });
    await seedEveAccount(harness.db, { id: 'acc-1', characterId: 42, userId: 'member' });
    await seedEveAccount(harness.db, { id: 'acc-2', characterId: 43, userId: 'member' });
    await seedEveAccount(harness.db, { id: 'acc-3', characterId: 44, userId: 'outsider' });
    await seedEveAccount(harness.db, { id: 'acc-4', characterId: 45, userId: 'direct' });
    await harness.db.insert(account).values({
      id: 'discord', accountId: '42', providerId: 'discord', userId: 'outsider',
      createdAt: new Date(), updatedAt: new Date(),
    });

    expect((await getMapAccessCandidateUserIds([42, 45], [990])).sort()).toEqual(['direct', 'member']);
    await expect(getMapAccessCandidateUserIds([], [990])).resolves.toEqual(['member']);
    await expect(getMapAccessCandidateUserIds([45], [])).resolves.toEqual(['direct']);
    await expect(getMapAccessCandidateUserIds([], [])).resolves.toEqual([]);
  });

  it('finds every affected corporation map, including archived and tombstoned maps', async () => {
    await seedUser(harness.db, 'creator');
    const active = '11111111-1111-4111-8111-111111111111';
    const archived = '22222222-2222-4222-8222-222222222222';
    const tombstoned = '33333333-3333-4333-8333-333333333333';
    const now = new Date();
    await harness.db.insert(maps).values([
      { id: active, userId: 'creator', name: 'active' },
      { id: archived, userId: 'creator', name: 'archived', ...archivedMapLifecycle(now) },
      { id: tombstoned, userId: 'creator', name: 'tombstoned', ...tombstonedMapLifecycle(now) },
    ]);
    await harness.db.insert(mapAccess).values([
      { mapId: active, ownerType: 'corporation', ownerId: 990, role: 'viewer' },
      { mapId: active, ownerType: 'corporation', ownerId: 991, role: 'editor' },
      { mapId: archived, ownerType: 'corporation', ownerId: 990, role: 'viewer' },
      { mapId: tombstoned, ownerType: 'corporation', ownerId: 991, role: 'viewer' },
      { mapId: archived, ownerType: 'character', ownerId: 991, role: 'viewer' },
    ]);

    await seedCharacter(harness.db, 42, { corporationId: 990 });
    await seedCharacter(harness.db, 43, { corporationId: 991 });
    expect((await affectedMapIdsForCharacter(42)).sort()).toEqual([active, archived].sort());
    expect((await affectedMapIdsForCharacter(43)).sort()).toEqual([active, tombstoned].sort());

    const pending = await enqueueAffectedMapAccessChanges(43);
    expect(pending.map((row) => row.mapId).sort()).toEqual([active, tombstoned].sort());
    const queued = await harness.db
      .select({ mapId: pendingMapAccessChanges.mapId, version: pendingMapAccessChanges.version })
      .from(pendingMapAccessChanges);
    expect(queued).toEqual(expect.arrayContaining(pending));
    expect(queued).toHaveLength(2);
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
        expect.objectContaining({
          archivedAt: expect.any(Date),
          purgeRequestedAt: expect.any(Date),
          lifecycleStatus: 'purge_queued',
        }),
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
      {
        id: '10000000-0000-4000-8000-000000000004',
        userId: 'creator',
        name: 'Archived',
        ...archivedMapLifecycle(base),
      },
      {
        id: '10000000-0000-4000-8000-000000000005',
        userId: 'creator',
        name: 'Tombstoned',
        ...archivedMapLifecycle(base),
        ...tombstonedMapLifecycle(base),
      },
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
      {
        id: '20000000-0000-4000-8000-000000000001',
        userId: 'viewer',
        name: 'Created',
        ...archivedMapLifecycle(new Date(now.getTime() - 1_000)),
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        userId: 'creator',
        name: 'Delegated admin',
        ...archivedMapLifecycle(new Date(now.getTime() - 2_000)),
      },
      {
        id: '20000000-0000-4000-8000-000000000003',
        userId: 'creator',
        name: 'Viewer only',
        ...archivedMapLifecycle(new Date(now.getTime() - 3_000)),
      },
      {
        id: '20000000-0000-4000-8000-000000000004',
        userId: 'creator',
        name: 'Expired',
        ...archivedMapLifecycle(new Date('2026-06-01T00:00:00.000Z')),
      },
      {
        id: '20000000-0000-4000-8000-000000000005',
        userId: 'creator',
        name: 'Purge requested',
        ...archivedMapLifecycle(new Date(now.getTime() - 4_000)),
        ...purgeQueuedMapLifecycle(now),
      },
      {
        id: '20000000-0000-4000-8000-000000000006',
        userId: 'creator',
        name: 'Tombstoned',
        ...archivedMapLifecycle(new Date(now.getTime() - 5_000)),
        ...tombstonedMapLifecycle(now),
      },
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
    ).resolves.toEqual({ mapId, version: expect.any(String) });
    await expect(
      applyAuthorizedMapGrantChange(
        'creator',
        { characterIds: [], corporationIds: [] },
        mapId,
        upsert,
        harness.db,
      ),
    ).resolves.toEqual({ mapId, version: expect.any(String) });
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
    ).resolves.toEqual({ mapId, version: expect.any(String) });

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

    const [queued] = await harness.db.select().from(pendingMapAccessChanges);
    expect(queued).toMatchObject({ mapId, version: expect.any(String) });

    await harness.db
      .update(maps)
      .set(archivedMapLifecycle(new Date()))
      .where(eq(maps.id, mapId));
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
    ).resolves.toBeNull();
    await harness.db
      .update(maps)
      .set(tombstonedMapLifecycle(new Date()))
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
    ).resolves.toBeNull();
    await expect(
      harness.db.select().from(mapAccess).where(eq(mapAccess.mapId, mapId)),
    ).resolves.toHaveLength(2);
    await expect(
      harness.db.select().from(maps).where(eq(maps.id, mapId)),
    ).resolves.toHaveLength(1);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([queued]);
  });

  it.each(['upsert', 'revoke'] as const)('rolls back %s when its durable queue write fails', async (operation) => {
    await seedUser(harness.db, 'creator');
    const mapId = '30000000-0000-4000-8000-000000000002';
    await harness.db.insert(maps).values({ id: mapId, userId: 'creator', name: 'Atomic access' });
    const principal = { ownerType: 'character' as const, ownerId: 42 };
    await harness.db.insert(mapAccess).values({ mapId, ...principal, role: 'viewer' });
    await harness.db.execute(sql`
      ALTER TABLE map_access_changes ADD CONSTRAINT reject_test_queue CHECK (false)
    `);
    try {
      const change = operation === 'upsert'
        ? { operation, grant: { ...principal, role: 'admin' as const } }
        : { operation, principal };
      await expect(applyAuthorizedMapGrantChange(
        'creator', { characterIds: [], corporationIds: [] }, mapId, change, harness.db,
      )).rejects.toThrow();
      expect(await harness.db.select().from(mapAccess)).toEqual([
        expect.objectContaining({ mapId, ...principal, role: 'viewer' }),
      ]);
      expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([]);
    } finally {
      await harness.db.execute(sql`
        ALTER TABLE map_access_changes DROP CONSTRAINT reject_test_queue
      `);
    }
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
