// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user-location-1';
const OTHER = 'user-location-other';
const CHAR_A = 90_000_101;
const CHAR_B = 90_000_102;
const SECRET = 'svc-secret-location';

function locationDoc(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    solarSystemId: 30_000_142,
    stationId: null as number | null,
    structureId: null as number | null,
    shipTypeId: 670 as number | null,
    prevSolarSystemId: null as number | null,
    prevFresh: false,
    observedAt: 1_700_000_000_000,
    etagLocation: 'loc' as string | null,
    etagShip: 'ship' as string | null,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('characterLocation.purgeForUser', () => {
  it('deletes every characterLocation doc and mapTracking row for the user when characterId is null', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_B));
      await ctx.db.insert('characterLocation', locationDoc(OTHER, CHAR_A));
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
      await ctx.db.insert('mapTracking', {
        mapId: 'map-b',
        userId: USER,
        characterId: CHAR_B,
      });
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: OTHER,
        characterId: CHAR_A,
      });
    });

    const out = await t.mutation(internal.characterLocation.purgeForUser, {
      userId: USER,
      characterId: null,
    });
    expect(out).toEqual({ deletedLocations: 2, deletedTracking: 2 });

    const remainingLocations = await t.run((ctx) => ctx.db.query('characterLocation').collect());
    const remainingTracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    expect(remainingLocations.map((doc) => doc.userId)).toEqual([OTHER]);
    expect(remainingTracking.map((doc) => doc.userId)).toEqual([OTHER]);
  });

  it('deletes only the named character\'s location and tracking rows', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_B));
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_B,
      });
    });

    const out = await t.mutation(internal.characterLocation.purgeForUser, {
      userId: USER,
      characterId: CHAR_A,
    });
    expect(out).toEqual({ deletedLocations: 1, deletedTracking: 1 });

    const locations = await t.run((ctx) =>
      ctx.db.query('characterLocation').withIndex('by_user', (q) => q.eq('userId', USER)).collect(),
    );
    const tracking = await t.run((ctx) =>
      ctx.db
        .query('mapTracking')
        .withIndex('by_user_character', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(locations.map((doc) => doc.characterId)).toEqual([CHAR_B]);
    expect(tracking.map((doc) => doc.characterId)).toEqual([CHAR_B]);
  });

  it('is a no-op when there is nothing to delete', async () => {
    const t = convexTest(schema, modules);
    const out = await t.mutation(internal.characterLocation.purgeForUser, {
      userId: USER,
      characterId: null,
    });
    expect(out).toEqual({ deletedLocations: 0, deletedTracking: 0 });
  });
});

describe('POST /purge-location-tracking', () => {
  it('rejects a request without the service bearer token', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await convexTest(schema, modules).fetch('/purge-location-tracking', {
      method: 'POST',
      body: JSON.stringify({ userId: USER, characterId: null }),
    });
    expect(res.status).toBe(401);
  });

  it('returns a clean 400 for a malformed body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await convexTest(schema, modules).fetch('/purge-location-tracking', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('empties both tables for the user when characterId is null', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
    });

    const res = await t.fetch('/purge-location-tracking', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ userId: USER, characterId: null }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedLocations: 1, deletedTracking: 1 });

    const locations = await t.run((ctx) => ctx.db.query('characterLocation').collect());
    const tracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    expect(locations).toEqual([]);
    expect(tracking).toEqual([]);
  });
});
