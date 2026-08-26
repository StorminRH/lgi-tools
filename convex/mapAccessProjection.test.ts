// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { tryMapAccessForUser } from './lib/mapAccess';
import { MAP_FIXTURE_PAGE_SIZE } from './mapFixtures';
import { MAP_ACCESS_PURGE_BATCH } from './mapAccessProjection';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';


const MAP_A = 'map-a';
const MAP_B = 'map-b';
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';

type Chain = TestConvex<typeof schema>;
let nextRevision = 1;

function asUser(t: Chain, userId: string) {
  return t.withIdentity({ subject: userId });
}

async function reconcile(
  t: Chain,
  mapId: string,
  claims: Array<{ userId: string; roles: Array<'viewer' | 'editor' | 'admin'> }>,
) {
  const result = await reconcileAt(t, mapId, claims, nextRevision);
  nextRevision += 1;
  const { outcome, ...counts } = result;
  expect(outcome).toBe('applied');
  return counts;
}

function reconcileAt(
  t: Chain,
  mapId: string,
  claims: Array<{ userId: string; roles: Array<'viewer' | 'editor' | 'admin'> }>,
  revision: number,
) {
  return t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
    mapId,
    revision,
    claims,
  });
}

async function readClaims(t: Chain, mapId: string) {
  return t.run(async (ctx) =>
    (await ctx.db.query('mapAccess').withIndex('by_map', (q) => q.eq('mapId', mapId)).collect())
      .map((row) => ({
        userId: row.userId,
        roles: row.roles,
        _id: row._id,
        _creationTime: row._creationTime,
        keys: Object.keys(row).sort(),
      }))
      .sort((left, right) => left.userId.localeCompare(right.userId)),
  );
}

describe('reconcileMapClaims', () => {
  it('writes, no-ops an identical re-run, updates a role, and deletes by absence or empty roles', async () => {
    const t = convexTest(schema, modules);
    const counts = await reconcile(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);

    expect(counts).toEqual({ inserted: 2, updated: 0, deleted: 0, unchanged: 0 });
    expect(await readClaims(t, MAP_A)).toMatchObject([
      { userId: EDITOR, roles: ['editor'], keys: ['_creationTime', '_id', 'mapId', 'roles', 'userId'] },
      { userId: OWNER, roles: ['admin'], keys: ['_creationTime', '_id', 'mapId', 'roles', 'userId'] },
    ]);

    const before = await readClaims(t, MAP_A);
    expect(
      await reconcile(t, MAP_A, [
        { userId: OWNER, roles: ['admin'] },
        { userId: EDITOR, roles: ['editor'] },
      ]),
    ).toEqual({ inserted: 0, updated: 0, deleted: 0, unchanged: 2 });
    expect(await readClaims(t, MAP_A)).toEqual(before);

    expect(
      await reconcile(t, MAP_A, [
        { userId: OWNER, roles: ['admin'] },
        { userId: EDITOR, roles: ['viewer'] },
      ]),
    ).toEqual({ inserted: 0, updated: 1, deleted: 0, unchanged: 1 });
    expect(await readClaims(t, MAP_A)).toMatchObject([
      { userId: EDITOR, roles: ['viewer'] },
      { userId: OWNER, roles: ['admin'] },
    ]);

    expect(
      await reconcile(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]),
    ).toEqual({ inserted: 0, updated: 0, deleted: 1, unchanged: 1 });
    expect(await readClaims(t, MAP_A)).toMatchObject([{ userId: OWNER, roles: ['admin'] }]);

    await reconcile(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    expect(
      await reconcile(t, MAP_A, [
        { userId: OWNER, roles: ['admin'] },
        { userId: EDITOR, roles: [] },
      ]),
    ).toEqual({ inserted: 0, updated: 0, deleted: 1, unchanged: 1 });
    expect(await readClaims(t, MAP_A)).toMatchObject([{ userId: OWNER, roles: ['admin'] }]);
  });

  it('rejects an older delivery and accepts an exact retry without rewriting', async () => {
    const t = convexTest(schema, modules);
    const current = await reconcileAt(
      t,
      MAP_A,
      [{ userId: OWNER, roles: ['admin'] }],
      20,
    );
    expect(current).toMatchObject({ outcome: 'applied', inserted: 1 });
    const before = await readClaims(t, MAP_A);

    await expect(reconcileAt(t, MAP_A, [], 19)).resolves.toEqual({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'stale',
    });
    await expect(
      reconcileAt(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }], 20),
    ).resolves.toEqual({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'duplicate',
    });
    expect(await readClaims(t, MAP_A)).toEqual(before);
  });

  it('tears down one map, leaves the other, and restores the full set on resync', async () => {
    const t = convexTest(schema, modules);
    const claims: Array<{ userId: string; roles: Array<'viewer' | 'editor' | 'admin'> }> = [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor', 'viewer'] },
    ];
    await reconcile(t, MAP_A, claims);
    await reconcile(t, MAP_B, [{ userId: VIEWER, roles: ['viewer'] }]);

    expect(await reconcile(t, MAP_A, [])).toEqual({
      inserted: 0,
      updated: 0,
      deleted: 2,
      unchanged: 0,
    });
    expect(await readClaims(t, MAP_A)).toEqual([]);
    expect(await readClaims(t, MAP_B)).toMatchObject([{ userId: VIEWER, roles: ['viewer'] }]);

    expect(await reconcile(t, MAP_A, claims)).toEqual({
      inserted: 2,
      updated: 0,
      deleted: 0,
      unchanged: 0,
    });
    expect(await readClaims(t, MAP_A)).toMatchObject([
      { userId: EDITOR, roles: ['editor', 'viewer'] },
      { userId: OWNER, roles: ['admin'] },
    ]);
    expect(await reconcile(t, MAP_A, claims)).toEqual({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 2,
    });
    expect(await readClaims(t, MAP_B)).toMatchObject([{ userId: VIEWER, roles: ['viewer'] }]);
  });

  it('repairs a seeded duplicate (mapId, userId) pair to exactly one row', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: MAP_A, userId: EDITOR, roles: ['viewer'] });
      await ctx.db.insert('mapAccess', { mapId: MAP_A, userId: EDITOR, roles: ['editor'] });
    });

    const counts = await reconcile(t, MAP_A, [{ userId: EDITOR, roles: ['editor'] }]);
    const rows = await readClaims(t, MAP_A);

    expect(counts.deleted).toBeGreaterThanOrEqual(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: EDITOR, roles: ['editor'] });

    await expect(
      asUser(t, EDITOR).query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: null,
      }),
    ).resolves.toMatchObject({ page: [], isDone: true });
  });

  it('last-entry-wins when a desired payload repeats one userId', async () => {
    const t = convexTest(schema, modules);
    const counts = await reconcile(t, MAP_A, [
      { userId: EDITOR, roles: ['viewer'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);

    expect(counts).toEqual({ inserted: 1, updated: 0, deleted: 0, unchanged: 0 });
    expect(await readClaims(t, MAP_A)).toMatchObject([{ userId: EDITOR, roles: ['editor'] }]);
  });

  it('stores unordered and duplicated roles in canonical precedence order', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, MAP_A, [
      { userId: EDITOR, roles: ['viewer', 'admin', 'viewer', 'editor'] },
    ]);

    expect(await readClaims(t, MAP_A)).toMatchObject([
      { userId: EDITOR, roles: ['admin', 'editor', 'viewer'] },
    ]);

    const counts = await reconcile(t, MAP_A, [
      { userId: EDITOR, roles: ['viewer', 'editor', 'admin'] },
    ]);
    expect(counts).toEqual({ inserted: 0, updated: 0, deleted: 0, unchanged: 1 });
  });
});

describe('purgeUserClaims', () => {
  it('batches deletes through by_user with a truthful hasMore', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < MAP_ACCESS_PURGE_BATCH + 1; index += 1) {
        await ctx.db.insert('mapAccess', {
          mapId: `map-${index}`,
          userId: EDITOR,
          roles: ['viewer'],
        });
      }
      await ctx.db.insert('mapAccess', {
        mapId: MAP_B,
        userId: OWNER,
        roles: ['admin'],
      });
    });

    const first = await t.mutation(internal.mapAccessProjection.purgeUserClaims, {
      userId: EDITOR,
    });
    expect(first).toEqual({ deleted: MAP_ACCESS_PURGE_BATCH, hasMore: true });

    const second = await t.mutation(internal.mapAccessProjection.purgeUserClaims, {
      userId: EDITOR,
    });
    expect(second).toEqual({ deleted: 1, hasMore: false });

    const remaining = await t.run(async (ctx) =>
      ctx.db.query('mapAccess').withIndex('by_user', (q) => q.eq('userId', OWNER)).collect(),
    );
    expect(remaining).toHaveLength(1);
  });

  it("sweeps the user's mapTracking rows as the account-purge backstop", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: MAP_A, userId: EDITOR, roles: ['viewer'] });
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: EDITOR, characterId: 90_000_001 });
      await ctx.db.insert('mapTracking', { mapId: MAP_B, userId: EDITOR, characterId: 90_000_002 });
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: OWNER, characterId: 90_000_003 });
    });

    const result = await t.mutation(internal.mapAccessProjection.purgeUserClaims, {
      userId: EDITOR,
    });
    expect(result).toEqual({ deleted: 3, hasMore: false });

    const remaining = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    expect(remaining.map((row) => row.userId)).toEqual([OWNER]);
  });
});

describe('gate returns projected roles', () => {
  it('normalizes a stored legacy owner claim to current admin authorization', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('mapAccess', {
        mapId: MAP_A,
        userId: OWNER,
        roles: ['owner'],
      }),
    );

    const principal = await t.run((ctx) =>
      tryMapAccessForUser(ctx, MAP_A, OWNER, 'edit'),
    );
    expect(principal).toEqual({ userId: OWNER, roles: ['admin'] });
  });
});

describe('revocation', () => {
  it('flips a previously succeeding gated read to FORBIDDEN after claim removal', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, MAP_A, [{ userId: EDITOR, roles: ['editor'] }]);
    await expect(
      asUser(t, EDITOR).query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: null,
      }),
    ).resolves.toMatchObject({ isDone: true });

    await reconcile(t, MAP_A, []);

    await expect(
      asUser(t, EDITOR).query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: null,
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    try {
      await asUser(t, EDITOR).query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: null,
      });
      expect.unreachable('expected FORBIDDEN');
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
      expect((error as ConvexError<{ code: string }>).data).toEqual({ code: 'FORBIDDEN' });
    }
  });
});

describe('read-set cost', () => {
  it('drains pinned collection sizes in exact pages of at most 25 rows', async () => {
    const t = convexTest(schema, modules);
    await reconcile(t, MAP_A, [{ userId: EDITOR, roles: ['editor'] }]);

    await t.run(async (ctx) => {
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert('mapSystems', { mapId: MAP_A, systemId: 30_000_000 + index });
      }
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: 30_000_000 + index,
          toSystemId: 30_000_100 + index,
          wormholeTypeCode: null,
          shipSize: null,
          massState: 'stable',
        }));
      }
      for (let index = 0; index < 60; index += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: 30_000_000 + (index % 50),
          signatureId: `SIG-${String(index).padStart(3, '0')}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: null,
          purgeAfter: null,
        });
      }
      for (let index = 0; index < 10; index += 1) {
        await ctx.db.insert('mapNotes', {
          mapId: MAP_A,
          targetKind: 'map',
          targetId: MAP_A,
          body: `note-${index}`,
        });
      }
    });

    async function drain(
      collection: 'systems' | 'connections' | 'signatures' | 'notes',
    ): Promise<{ rows: number; pages: number; maxPage: number }> {
      let rows = 0;
      let pages = 0;
      let maxPage = 0;
      let cursor: string | null = null;
      for (;;) {
        const page: {
          page: readonly unknown[];
          isDone: boolean;
          continueCursor: string;
        } = await asUser(t, EDITOR).query(api.mapFixtures.readMapCollection, {
          mapId: MAP_A,
          collection,
          cursor,
        });
        pages += 1;
        rows += page.page.length;
        maxPage = Math.max(maxPage, page.page.length);
        expect(page.page.length).toBeLessThanOrEqual(MAP_FIXTURE_PAGE_SIZE);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      return { rows, pages, maxPage };
    }

    expect(await drain('systems')).toEqual({ rows: 50, pages: 2, maxPage: 25 });
    expect(await drain('connections')).toEqual({ rows: 30, pages: 2, maxPage: 25 });
    expect(await drain('signatures')).toEqual({ rows: 60, pages: 3, maxPage: 25 });
    expect(await drain('notes')).toEqual({ rows: 10, pages: 1, maxPage: 10 });
  });
});
