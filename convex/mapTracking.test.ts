// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import {
  FEED_FRESHNESS_QUANTUM_MS,
  TRACKED_CHARACTERS_PER_MAP_USER_CAP,
} from './mapTracking';
import { newIdleSubject } from './lib/subjects';
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
  claims: Array<{ userId: string; roles: Array<'viewer' | 'editor' | 'admin'> }>,
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
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await grant(t, MAP_B, [{ userId: OWNER, roles: ['admin'] }]);

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
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);

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

  it('refuses opt-in beyond the per-(map, user) cap but keeps toggle-off/re-add working', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    const caller = asUser(t, OWNER);
    await t.run(async (ctx) => {
      for (let index = 0; index < TRACKED_CHARACTERS_PER_MAP_USER_CAP; index += 1) {
        await ctx.db.insert('mapTracking', {
          mapId: MAP_A,
          userId: OWNER,
          characterId: 91_000_000 + index,
        });
      }
    });

    await expect(
      caller.mutation(api.mapTracking.setTracking, {
        mapId: MAP_A,
        characterId: 92_000_000,
        tracked: true,
      }),
    ).rejects.toThrow(ConvexError);

    // Re-opting an already-tracked character at the cap stays idempotent-ok.
    await caller.mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: 91_000_000,
      tracked: true,
    });
    // Freeing one slot re-admits a new character.
    await caller.mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: 91_000_000,
      tracked: false,
    });
    await caller.mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: 92_000_000,
      tracked: true,
    });
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
      { userId: OWNER, roles: ['admin'] },
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
        transitionObservedAt: 1_699_999_999_000,
        observedAt: 1_700_000_000_000,
        etagLocation: 'loc-1',
        etagShip: 'ship-1',
      });
    });

    const result = await asUser(t, OWNER).query(api.mapTracking.forMap, { mapId: MAP_A });
    const byUser = new Map(result.tracked.map((row) => [row.userId, row]));

    expect(result.ownTrackedCharacterIds).toEqual([CHAR]);
    expect(byUser.get(OWNER)?.location?.solarSystemId).toBe(30_000_142);
    expect(byUser.get(EDITOR)?.characterId).toBe(CHAR);
    expect(byUser.get(EDITOR)?.location).toBeNull();
  });

  it('answers owner-scoped feed freshness: covered characters get the quantized bucket, everyone else null', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });
    await asUser(t, EDITOR).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    const finishedAt = 1_700_000_123_456;
    const bucket =
      Math.floor(finishedAt / FEED_FRESHNESS_QUANTUM_MS) * FEED_FRESHNESS_QUANTUM_MS;
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', {
        ...newIdleSubject('characterLocation', OWNER),
        syncedCharacterIds: [CHAR],
        coveredCharacterIds: [CHAR],
        lastFinishedAt: finishedAt,
      });
      await ctx.db.insert('syncSubjects', {
        ...newIdleSubject('onlineStatus', EDITOR),
        lastFinishedAt: 1_700_000_999_999,
      });
    });

    const result = await asUser(t, OWNER).query(api.mapTracking.feedFreshness, {
      mapId: MAP_A,
    });
    const byOwnerCharacter = new Map(
      result.fresh.map((entry) => [
        `${entry.userId}/${entry.characterId}`,
        entry.feedFreshAt,
      ]),
    );
    expect(byOwnerCharacter.get(`${OWNER}/${CHAR}`)).toBe(bucket);
    expect(bucket).not.toBe(finishedAt);
    expect(byOwnerCharacter.get(`${OWNER}/${CHAR_B}`)).toBeNull();
    expect(byOwnerCharacter.get(`${EDITOR}/${CHAR}`)).toBeNull();
    expect(result.fresh.map(({ userId, characterId }) => [userId, characterId])).toEqual([
      [EDITOR, CHAR],
      [OWNER, CHAR],
      [OWNER, CHAR_B],
    ]);
    const overlay = await asUser(t, OWNER).query(api.mapTracking.forMap, { mapId: MAP_A });
    const anyRow = overlay.tracked[0];
    expect(anyRow).toBeDefined();
    if (anyRow === undefined) throw new Error('expected a tracked overlay row');
    expect('feedFreshAt' in anyRow).toBe(false);
  });

  it('answers feedFreshness as an empty list without access (subscription doctrine)', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    const result = await asUser(t, EDITOR).query(api.mapTracking.feedFreshness, {
      mapId: MAP_A,
    });
    expect(result.fresh).toEqual([]);
  });

  it('returns an empty tracked list when access is revoked (subscription doctrine)', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(api.mapTracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await grant(t, MAP_A, []);

    const result = await asUser(t, OWNER).query(api.mapTracking.forMap, { mapId: MAP_A });
    expect(result).toEqual({ tracked: [], ownTrackedCharacterIds: [] });
  });
});

describe('mapTracking revocation cascade', () => {
  it('deletes the revoked user\'s mapTracking rows in the same reconcile apply', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
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
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);

    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
  });

  it('sweeps every mapTracking row on full map teardown (claims: [])', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
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
