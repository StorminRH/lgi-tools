// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const CHAR = 90_000_001;
const CHAR_B = 90_000_002;

type Chain = TestConvex<typeof schema>;

function asUser(t: Chain, userId: string) {
  return t.withIdentity({ subject: userId });
}

async function grant(
  t: Chain,
  mapId: string,
  claims: Array<{ userId: string; roles: Array<'viewer' | 'editor' | 'owner'> }>,
) {
  return t.mutation(internal.mapAccessProjection.reconcileMapClaims, { mapId, claims });
}

async function readTracking(t: Chain, mapId?: string) {
  return t.run(async (ctx) => {
    const rows =
      mapId === undefined
        ? await ctx.db.query('mapTracking').collect()
        : await ctx.db
            .query('mapTracking')
            .withIndex('by_map', (q) => q.eq('mapId', mapId))
            .collect();
    return rows
      .map((row) => ({
        mapId: row.mapId,
        userId: row.userId,
        characterId: row.characterId,
      }))
      .sort(
        (left, right) =>
          left.mapId.localeCompare(right.mapId) ||
          left.userId.localeCompare(right.userId) ||
          left.characterId - right.characterId,
      );
  });
}

describe('mapTracking.setTracking', () => {
  it('opts one character into tracking per map and tears it down independently', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['owner'] }]);
    await grant(t, MAP_B, [{ userId: OWNER, roles: ['owner'] }]);

    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_B,
      characterId: CHAR,
      tracked: true,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);

    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);
  });

  it('is idempotent on repeated opt-in and opt-out', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['owner'] }]);

    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);

    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });
    expect(await readTracking(t, MAP_A)).toEqual([]);
  });

  it('refuses setTracking without a map-access claim', async () => {
    const t = convexTest(schema, modules);
    await expect(
      asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
        mapId: MAP_A,
        characterId: CHAR,
        tracked: true,
      }),
    ).rejects.toThrow(ConvexError);
  });
});

describe('mapTracking.forMap', () => {
  it('joins tracking rows to location by (userId, characterId) and discloses nothing for a forged row', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['owner'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);

    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    // Forged row: EDITOR's mapTracking names OWNER's character id. The join key
    // is the row's own (userId, characterId), so it must not surface OWNER's
    // location document.
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: MAP_A,
        userId: EDITOR,
        characterId: CHAR,
      });
      await ctx.db.insert('characterLocation', {
        userId: OWNER,
        characterId: CHAR,
        solarSystemId: 30_000_142,
        stationId: null,
        structureId: null,
        shipTypeId: 670,
        prevSolarSystemId: null,
        prevFresh: false,
        observedAt: 1_700_000_000_000,
        etagLocation: 'loc-1',
        etagShip: 'ship-1',
      });
    });

    const result = await asUser(t, OWNER).query(api.mapTracking.forMap, { mapId: MAP_A });
    const byUser = new Map(result.tracked.map((row) => [row.userId, row]));

    expect(byUser.get(OWNER)?.location?.solarSystemId).toBe(30_000_142);
    expect(byUser.get(EDITOR)?.characterId).toBe(CHAR);
    expect(byUser.get(EDITOR)?.location).toBeNull();
  });

  it('returns an empty tracked list when access is revoked (subscription doctrine)', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['owner'] }]);
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await grant(t, MAP_A, []);

    const result = await asUser(t, OWNER).query(api.mapTracking.forMap, { mapId: MAP_A });
    expect(result).toEqual({ tracked: [] });
  });
});

describe('mapTracking revocation cascade', () => {
  it('deletes the revoked user\'s mapTracking rows in the same reconcile apply', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['owner'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, EDITOR).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });

    // Revoke EDITOR — OWNER's tracking must survive; EDITOR's must vanish.
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['owner'] }]);

    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
  });

  it('sweeps every mapTracking row on full map teardown (claims: [])', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['owner'] }]);
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    // Orphan tracking with no claim — map purge must still clear it.
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: MAP_A,
        userId: 'orphaned',
        characterId: CHAR_B,
      });
    });

    await grant(t, MAP_A, []);

    expect(await readTracking(t, MAP_A)).toEqual([]);
  });
});
