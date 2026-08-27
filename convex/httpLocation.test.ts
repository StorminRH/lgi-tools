// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

import { CONVEX_HTTP_SECRET, postConvexHttp } from './__tests__/http.setup';
import { modules } from './__tests__/modules.setup';

const USER = 'user-location-1';
const CHAR_A = 90_000_101;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /leave-sync', () => {
  it('rejects missing bearer and malformed bodies before retire work', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    expect(
      (
        await postConvexHttp(
          '/leave-sync',
          JSON.stringify({
            userId: 'user-1',
            dataset: 'characterLocation',
            tabId: 'tab-aaaa-bbbb',
          }),
          false,
        )
      ).status,
    ).toBe(401);
    expect((await postConvexHttp('/leave-sync', 'not json')).status).toBe(400);
  });

  it('retires a matching tab and ignores a stale close', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', {
        dataset: 'characterLocation',
        userId: 'user-1',
        status: 'idle',
        lastRequestedAt: 0,
        workId: null,
        nextDueAt: Date.now() + 5_000,
        minExpiresAt: null,
        syncedCharacterIds: [101],
        lastFinishedAt: Date.now(),
        lastError: null,
        coveredCharacterIds: [101],
        rlGroup: null,
        rlLimit: null,
        rlRemaining: null,
        rlUsed: null,
      });
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'user-1',
        lastSeenAt: Date.now(),
        lastVisibleAt: Date.now(),
        tabId: 'tab-live-aaaa',
      });
      await ctx.db.insert('characterLocationCovered', {
        userId: 'user-1',
        characterId: 101,
      });
    });

    const stale = await t.fetch('/leave-sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({
        userId: 'user-1',
        dataset: 'characterLocation',
        tabId: 'tab-stale-bbbb',
      }),
    });
    expect(stale.status).toBe(200);
    expect(await stale.json()).toEqual({ retired: false });

    const live = await t.fetch('/leave-sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({
        userId: 'user-1',
        dataset: 'characterLocation',
        tabId: 'tab-live-aaaa',
      }),
    });
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ retired: true });

    const after = await t.run(async (ctx) => ({
      subject: await ctx.db.query('syncSubjects').unique(),
      covered: await ctx.db.query('characterLocationCovered').collect(),
    }));
    expect(after.subject?.nextDueAt).toBeNull();
    expect(after.covered).toEqual([]);
  });
});

describe('POST /purge-location-tracking', () => {
  it('rejects a request without the service bearer token', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const res = await convexTest(schema, modules).fetch('/purge-location-tracking', {
      method: 'POST',
      body: JSON.stringify({ userId: USER, characterId: null }),
    });
    expect(res.status).toBe(401);
  });

  it('returns a clean 400 for a malformed body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const res = await convexTest(schema, modules).fetch('/purge-location-tracking', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('empties both tables for the user when characterId is null', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', {
        userId: USER,
        characterId: CHAR_A,
        solarSystemId: 30_000_142,
        stationId: null,
        structureId: null,
        shipTypeId: 670,
        prevSolarSystemId: null,
        prevFresh: false,
        transitionObservedAt: 1_699_999_999_000,
        observedAt: 1_700_000_000_000,
        etagLocation: 'loc',
        etagShip: 'ship',
      });
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
    });

    const res = await t.fetch('/purge-location-tracking', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({ userId: USER, characterId: null }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deletedLocations: 1,
      deletedTracking: 1,
      deletedBookkeeping: 0,
    });

    const locations = await t.run((ctx) => ctx.db.query('characterLocation').collect());
    const tracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    expect(locations).toEqual([]);
    expect(tracking).toEqual([]);
  });
});
