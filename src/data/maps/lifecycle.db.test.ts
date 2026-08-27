import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { activeMapLifecycle } from './lifecycle-contract';
import { MAP_DELETE_GRACE_MS } from './queries';
import {
  archiveAuthorizedMap,
  claimPurgeableMaps,
  MAP_STAGED_PURGE_HOLD_MS,
  requestAuthorizedMapPurge,
  restoreAuthorizedMap,
  tombstonePurgedMap,
} from './lifecycle';
import {
  compensateFailedMapCreation,
  createMapAtomic,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
  publishCreatedMap,
} from './queries';
import { mapAccess, maps } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_map_lifecycle',
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

const NOW = new Date('2026-08-12T12:00:00.000Z');
const CREATOR = 'creator';
const ADMIN = 'admin';
const MAP_ID = '40000000-0000-4000-8000-000000000001';
const ADMIN_PRINCIPALS = { characterIds: [42], corporationIds: [] };

async function seedManagedMap() {
  await seedUser(harness.db, CREATOR);
  await seedUser(harness.db, ADMIN);
  await harness.db.insert(maps).values({
    id: MAP_ID,
    userId: CREATOR,
    name: 'Lifecycle map',
    createdAt: new Date(NOW.getTime() - MAP_STAGED_PURGE_HOLD_MS - 1_000),
  });
  await harness.db.insert(mapAccess).values({
    mapId: MAP_ID,
    ownerType: 'character',
    ownerId: 42,
    role: 'admin',
  });
}

describe.skipIf(!harness.reachable)('map lifecycle (real Postgres)', () => {
  it('admin delete hides immediately and restore inside grace returns the map', async () => {
    await seedManagedMap();

    await expect(
      archiveAuthorizedMap(ADMIN, ADMIN_PRINCIPALS, MAP_ID, NOW, harness.db),
    ).resolves.toBe(true);
    await expect(
      listAuthorizedMapsForPrincipals(ADMIN, ADMIN_PRINCIPALS, harness.db),
    ).resolves.toEqual([]);
    await expect(
      listDeletedRestorableMapsForPrincipals(
        ADMIN,
        ADMIN_PRINCIPALS,
        harness.db,
        NOW,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: MAP_ID, role: 'admin', archivedAt: NOW }),
    ]);

    const restoreAt = new Date(NOW.getTime() + MAP_DELETE_GRACE_MS - 1);
    await expect(
      restoreAuthorizedMap(
        ADMIN,
        ADMIN_PRINCIPALS,
        MAP_ID,
        restoreAt,
        harness.db,
      ),
    ).resolves.toBe(true);
    const [restored] = await harness.db.select().from(maps).where(eq(maps.id, MAP_ID));
    expect(restored).toMatchObject(activeMapLifecycle(restoreAt));
    await expect(
      listAuthorizedMapsForPrincipals(ADMIN, ADMIN_PRINCIPALS, harness.db),
    ).resolves.toEqual([expect.objectContaining({ id: MAP_ID, role: 'admin' })]);
  });

  it('refuses non-admin delete and restore at the exact grace boundary', async () => {
    await seedManagedMap();
    await expect(
      archiveAuthorizedMap(
        'viewer',
        { characterIds: [], corporationIds: [] },
        MAP_ID,
        NOW,
        harness.db,
      ),
    ).resolves.toBe(false);
    await expect(
      archiveAuthorizedMap(CREATOR, { characterIds: [], corporationIds: [] }, MAP_ID, NOW, harness.db),
    ).resolves.toBe(true);

    await expect(
      restoreAuthorizedMap(
        ADMIN,
        ADMIN_PRINCIPALS,
        MAP_ID,
        new Date(NOW.getTime() + MAP_DELETE_GRACE_MS),
        harness.db,
      ),
    ).resolves.toBe(false);
    const [stored] = await harness.db.select().from(maps).where(eq(maps.id, MAP_ID));
    expect(stored).toMatchObject({
      archivedAt: NOW,
      lifecycleStatus: 'archived',
      lifecycleEnteredAt: NOW,
    });
  });

  it('allows only the creator to fast-forward grace and never hard-deletes', async () => {
    await seedManagedMap();
    await archiveAuthorizedMap(CREATOR, { characterIds: [], corporationIds: [] }, MAP_ID, NOW, harness.db);

    await expect(
      requestAuthorizedMapPurge(ADMIN, MAP_ID, NOW, harness.db),
    ).resolves.toBe(false);
    await expect(
      requestAuthorizedMapPurge(CREATOR, MAP_ID, NOW, harness.db),
    ).resolves.toBe(true);
    const [queued] = await harness.db.select().from(maps).where(eq(maps.id, MAP_ID));
    expect(queued?.lifecycleStatus).toBe('purge_queued');
    await expect(claimPurgeableMaps(NOW, 25, harness.db)).resolves.toEqual([
      { id: MAP_ID },
    ]);
    await expect(
      listDeletedRestorableMapsForPrincipals(
        CREATOR,
        { characterIds: [], corporationIds: [] },
        harness.db,
        NOW,
      ),
    ).resolves.toEqual([]);
    await expect(harness.db.select().from(maps)).resolves.toHaveLength(1);
  });

  it('holds a staged in-flight creation out of the sweep until the projection window closes', async () => {
    await seedUser(harness.db, CREATOR);
    const mapId = await createMapAtomic(CREATOR, 'Staged chain', [], harness.db);
    const [staged] = await harness.db.select().from(maps).where(eq(maps.id, mapId));
    if (
      staged?.createdAt === undefined ||
      staged.archivedAt === null ||
      staged.purgeRequestedAt === null ||
      staged.lifecycleStatus !== 'purge_queued'
    ) {
      throw new Error('createMapAtomic did not persist a staged map with recovery markers');
    }
    const { createdAt } = staged;

    await expect(claimPurgeableMaps(createdAt, 25, harness.db)).resolves.toEqual([]);
    await expect(
      claimPurgeableMaps(
        new Date(createdAt.getTime() + MAP_STAGED_PURGE_HOLD_MS + 1_000),
        25,
        harness.db,
      ),
    ).resolves.toEqual([{ id: mapId }]);
    await expect(tombstonePurgedMap(mapId, createdAt, harness.db)).resolves.toBe(false);
  });

  it('gives an elapsed staged purge claim exclusive ownership over publish and compensation', async () => {
    await seedUser(harness.db, CREATOR);
    const mapId = await createMapAtomic(CREATOR, 'Claimed staged chain', [], harness.db);
    const [staged] = await harness.db.select().from(maps).where(eq(maps.id, mapId));
    if (staged === undefined) throw new Error('missing staged map');
    const afterHold = new Date(
      staged.createdAt.getTime() + MAP_STAGED_PURGE_HOLD_MS + 1,
    );

    await expect(claimPurgeableMaps(afterHold, 25, harness.db)).resolves.toEqual([
      { id: mapId },
    ]);
    await expect(publishCreatedMap(mapId, harness.db)).rejects.toThrow(
      'Map creation publish expected one staged row',
    );
    await expect(
      compensateFailedMapCreation(mapId, harness.db),
    ).resolves.toEqual({ outcome: 'purge-owned' });
    const [claimed] = await harness.db.select().from(maps).where(eq(maps.id, mapId));
    expect(claimed).toMatchObject({
      archivedAt: expect.any(Date),
      purgeRequestedAt: expect.any(Date),
      purgeClaimedAt: afterHold,
      tombstonedAt: null,
      lifecycleStatus: 'purge_claimed',
      lifecycleEnteredAt: afterHold,
    });
  });

  it('selects elapsed grace and tombstones only a still-eligible row', async () => {
    await seedManagedMap();
    await archiveAuthorizedMap(CREATOR, { characterIds: [], corporationIds: [] }, MAP_ID, NOW, harness.db);
    const afterGrace = new Date(NOW.getTime() + MAP_DELETE_GRACE_MS);

    await expect(claimPurgeableMaps(afterGrace, 25, harness.db)).resolves.toEqual([
      { id: MAP_ID },
    ]);
    await expect(tombstonePurgedMap(MAP_ID, afterGrace, harness.db)).resolves.toBe(true);
    await expect(tombstonePurgedMap(MAP_ID, afterGrace, harness.db)).resolves.toBe(false);
    const [stored] = await harness.db.select().from(maps).where(eq(maps.id, MAP_ID));
    expect(stored).toMatchObject({
      tombstonedAt: afterGrace,
      lifecycleStatus: 'tombstoned',
      lifecycleEnteredAt: afterGrace,
    });
  });
});
