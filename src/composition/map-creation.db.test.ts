import { describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedUser,
} from '@/db/test-support/db-test-harness';
import {
  compensateFailedMapCreation,
  createMapAtomic,
  listAuthorizedMapsForPrincipals,
  publishCreatedMap,
} from '@/data/maps/queries';
import { mapAccess, maps } from '@/data/maps/schema';
import { createProjectedMap } from './map-creation';

const PROJECTION_RESULT = {
  inserted: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  outcome: 'applied' as const,
};

const harness = await createDbTestHarness({
  schema: 'test_map_creation',
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

describe.skipIf(!harness.reachable)('map creation compensation (real Postgres)', () => {
  it('publishes a successfully projected staged map', async () => {
    await seedUser(harness.db, 'creator');
    const project = vi.fn().mockResolvedValue(PROJECTION_RESULT);

    const result = await createProjectedMap(
      'creator',
      {
        name: 'Projected chain',
        grants: [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
      },
      {
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
    });
    await expect(harness.db.select().from(mapAccess)).resolves.toHaveLength(1);
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
          grants: [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
        },
        {
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
      { name: 'Queued recovery', grants: [] },
      {
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
