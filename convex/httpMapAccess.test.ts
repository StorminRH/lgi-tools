// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { MAP_JUMP_BOOKKEEPING_PURGE_BATCH } from './mapJumpBookkeeping';
import schema from './schema';

import { CONVEX_HTTP_SECRET, postConvexHttp } from './__tests__/http.setup';
import { modules } from './__tests__/modules.setup';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /project-map-access', () => {
  it('rejects unauthorized, malformed, and invalid claim payloads before reconcile', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    expect(
      (
        await postConvexHttp(
          '/project-map-access',
          JSON.stringify({ mapId: 'map-1', claims: [{ userId: 'u1', roles: ['admin'] }] }),
          false,
        )
      ).status,
    ).toBe(401);
    expect((await postConvexHttp('/project-map-access', 'not json')).status).toBe(400);
    expect(
      (
        await postConvexHttp(
          '/project-map-access',
          JSON.stringify({
            mapId: 'map-1',
            revision: 1,
            claims: [{ userId: 'u1', roles: ['owner'] }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postConvexHttp(
          '/project-map-access',
          JSON.stringify({
            mapId: 'map-1',
            revision: 1,
            claims: [{ userId: 'u1', roles: [] }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postConvexHttp(
          '/project-map-access',
          JSON.stringify({
            mapId: 'map-1',
            revision: 1,
            claims: [
              { userId: 'u1', roles: ['viewer'] },
              { userId: 'u1', roles: ['editor'] },
            ],
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('reconciles a valid body and returns counts', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const res = await postConvexHttp(
      '/project-map-access',
      JSON.stringify({
        mapId: 'map-1',
        revision: 1,
        claims: [{ userId: 'u1', roles: ['admin'] }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'applied',
    });
  });

  it('drains a multi-batch bookkeeping teardown without touching another map', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index <= MAP_JUMP_BOOKKEEPING_PURGE_BATCH; index += 1) {
        await ctx.db.insert('mapJumpBookkeeping', {
          mapId: 'map-large',
          characterId: 90_000_000 + index,
          lastProcessedTransitionAt: index,
        });
      }
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-other',
        characterId: 91_000_000,
        lastProcessedTransitionAt: 1,
      });
    });

    const res = await t.fetch('/project-map-access', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({ mapId: 'map-large', revision: 1, claims: [] }),
    });

    expect(res.status).toBe(200);
    expect(await t.run(async (ctx) => ctx.db.query('mapJumpBookkeeping').collect())).toEqual([
      expect.objectContaining({ mapId: 'map-other', characterId: 91_000_000 }),
    ]);
  });

  it('does not drain bookkeeping for an older teardown delivery', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
      mapId: 'map-current',
      revision: 2,
      claims: [{ userId: 'u1', roles: ['admin'] }],
    });
    await t.run((ctx) =>
      ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-current',
        characterId: 90_000_001,
        lastProcessedTransitionAt: 1,
      }),
    );

    const res = await t.fetch('/project-map-access', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({
        mapId: 'map-current',
        revision: 1,
        claims: [],
      }),
    });

    expect(await res.json()).toMatchObject({ outcome: 'stale' });
    await expect(
      t.run((ctx) => ctx.db.query('mapJumpBookkeeping').collect()),
    ).resolves.toHaveLength(1);
  });
});

describe('POST /purge-map-access', () => {
  it('loops purge batches and returns totals', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 129; index += 1) {
        await ctx.db.insert('mapAccess', {
          mapId: `map-${index}`,
          userId: 'purge-me',
          roles: ['viewer'],
        });
      }
    });

    const res = await t.fetch('/purge-map-access', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({ userId: 'purge-me' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 129 });
  });
});

describe('POST /purge-map-chain', () => {
  it('rejects bad auth and malformed bodies before mutation work', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    expect(
      (await postConvexHttp('/purge-map-chain', JSON.stringify({ mapId: 'map-1' }), false)).status,
    ).toBe(401);
    expect((await postConvexHttp('/purge-map-chain', 'not json')).status).toBe(400);
    expect((await postConvexHttp('/purge-map-chain', JSON.stringify({ mapId: '' }))).status).toBe(400);
  });

  it('drains multiple batches across map tables and preserves another map', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 129; index += 1) {
        await ctx.db.insert('mapNotes', {
          mapId: 'map-large',
          targetKind: 'map',
          targetId: `note-${index}`,
          body: 'delete',
        });
      }
      await ctx.db.insert('mapAccess', {
        mapId: 'map-large',
        userId: 'user',
        roles: ['admin'],
      });
      await ctx.db.insert('mapNotes', {
        mapId: 'map-other',
        targetKind: 'map',
        targetId: 'keep',
        body: 'keep',
      });
    });

    const res = await t.fetch('/purge-map-chain', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({ mapId: 'map-large' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 130, remaining: false });
    await expect(
      t.run(async (ctx) => ({
        access: await ctx.db
          .query('mapAccess')
          .withIndex('by_map', (query) => query.eq('mapId', 'map-large'))
          .collect(),
        notes: await ctx.db
          .query('mapNotes')
          .withIndex('by_map', (query) => query.eq('mapId', 'map-large'))
          .collect(),
        other: await ctx.db
          .query('mapNotes')
          .withIndex('by_map', (query) => query.eq('mapId', 'map-other'))
          .collect(),
      })),
    ).resolves.toEqual({
      access: [],
      notes: [],
      other: [expect.objectContaining({ mapId: 'map-other', body: 'keep' })],
    });
  });
});
