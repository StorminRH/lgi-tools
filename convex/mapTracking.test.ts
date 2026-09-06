// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import schema from './schema';

import { modules } from './__tests__/modules.setup';

const tracking = {
  setTracking: api.mapTrackingOptIn.setTracking,
  forMap: api.mapTrackingLive.forMap,
  coverage: api.mapTrackingLive.coverage,
} as const;

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const CHAR = 90_000_001;
const CHAR_B = 90_000_002;

type Chain = TestConvex<typeof schema>;
let nextRevision = 1;

function asUser(t: Chain, userId: string) {
  return t.withIdentity({ subject: userId });
}

async function grant(
  t: Chain,
  mapId: string,
  claims: Array<{ userId: string; roles: Array<'viewer' | 'editor' | 'admin'> }>,
) {
  const revision = nextRevision;
  nextRevision += 1;
  return t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
    mapId,
    revision,
    claims,
  });
}

async function readBookkeeping(t: Chain) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query('mapJumpBookkeeping').collect();
    return rows
      .map((row) => ({
        mapId: row.mapId,
        characterId: row.characterId,
        lastProcessedTransitionAt: row.lastProcessedTransitionAt,
      }))
      .sort(
        (left, right) =>
          left.mapId.localeCompare(right.mapId) || left.characterId - right.characterId,
      );
  });
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

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_B,
      characterId: CHAR,
      tracked: true,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
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

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });
    expect(await readTracking(t, MAP_A)).toEqual([]);
  });

  it('deletes that map+character bookkeeping stamp on untrack and leaves the rest', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await grant(t, MAP_B, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_B,
      characterId: CHAR,
      tracked: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR,
        lastProcessedTransitionAt: 1,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR_B,
        lastProcessedTransitionAt: 2,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_B,
        characterId: CHAR,
        lastProcessedTransitionAt: 3,
      });
    });

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR_B },
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR_B, lastProcessedTransitionAt: 2 },
      { mapId: MAP_B, characterId: CHAR, lastProcessedTransitionAt: 3 },
    ]);
  });

  it('preserves a foreign tracker stamp when the caller has no matching row', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: true,
    });
    await t.run((ctx) => ctx.db.insert('mapJumpBookkeeping', {
      mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
    }));

    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
    ]);
    await expect(asUser(t, 'no-access').mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    })).rejects.toThrow(ConvexError);
  });

  it('retains shared bookkeeping until the last user stops tracking', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    for (const userId of [OWNER, EDITOR]) {
      await asUser(t, userId).mutation(tracking.setTracking, {
        mapId: MAP_A, characterId: CHAR, tracked: true,
      });
    }
    await t.run((ctx) => ctx.db.insert('mapJumpBookkeeping', {
      mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
    }));

    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    });
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    });
    expect(await readBookkeeping(t)).toEqual([]);
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
      caller.mutation(tracking.setTracking, {
        mapId: MAP_A,
        characterId: 92_000_000,
        tracked: true,
      }),
    ).rejects.toThrow(ConvexError);

    await caller.mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: 91_000_000,
      tracked: true,
    });
    await caller.mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: 91_000_000,
      tracked: false,
    });
    await caller.mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: 92_000_000,
      tracked: true,
    });
  });

  it('refuses setTracking without a map-access claim', async () => {
    const t = convexTest(schema, modules);
    await expect(
      asUser(t, OWNER).mutation(tracking.setTracking, {
        mapId: MAP_A,
        characterId: CHAR,
        tracked: true,
      }),
    ).rejects.toThrow(ConvexError);
  });
});

describe('mapTrackingLive.forMap', () => {
  it('joins tracking rows to location by (userId, characterId) and discloses nothing for a forged row', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

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

    const result = await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A });
    const byUser = new Map(result.tracked.map((row) => [row.userId, row]));

    expect(result.ownTrackedCharacterIds).toEqual([CHAR]);
    expect(byUser.get(OWNER)?.location?.solarSystemId).toBe(30_000_142);
    expect(byUser.get(EDITOR)?.characterId).toBe(CHAR);
    expect(byUser.get(EDITOR)?.location).toBeNull();
  });

  it('answers owner-scoped coverage: only flip-only rows count as covered', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });
    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', {
        userId: OWNER,
        characterId: CHAR,
      });
    });

    const overlay = await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A });
    const result = await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A,
      identities: overlay.tracked.map((row) => ({
        userId: row.userId,
        characterId: row.characterId,
      })),
    });
    const byOwnerCharacter = new Map(
      result.coverage.map((entry) => [
        `${entry.userId}/${entry.characterId}`,
        entry.covered,
      ]),
    );
    expect(byOwnerCharacter.get(`${OWNER}/${CHAR}`)).toBe(true);
    expect(byOwnerCharacter.get(`${OWNER}/${CHAR_B}`)).toBe(false);
    expect(byOwnerCharacter.get(`${EDITOR}/${CHAR}`)).toBe(false);
    expect(result.coverage.map(({ userId, characterId }) => [userId, characterId])).toEqual([
      [EDITOR, CHAR],
      [OWNER, CHAR],
      [OWNER, CHAR_B],
    ]);
    const anyRow = overlay.tracked[0];
    expect(anyRow).toBeDefined();
    if (anyRow === undefined) throw new Error('expected a tracked overlay row');
    expect('covered' in anyRow).toBe(false);
  });

  it('answers coverage as an empty list without access (subscription doctrine)', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    const result = await asUser(t, EDITOR).query(tracking.coverage, {
      mapId: MAP_A,
      identities: [{ userId: OWNER, characterId: CHAR }],
    });
    expect(result.coverage).toEqual([]);
  });

  it('answers coverage only for identities tracked on the map', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', {
        userId: OWNER,
        characterId: CHAR,
      });
    });

    const identities = [
      { userId: OWNER, characterId: CHAR },
      { userId: OWNER, characterId: CHAR_B },
    ];
    const untracked = await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A,
      identities,
    });
    expect(untracked.coverage).toEqual([
      { userId: OWNER, characterId: CHAR, covered: false },
      { userId: OWNER, characterId: CHAR_B, covered: false },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    const tracked = await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A,
      identities,
    });
    expect(tracked.coverage).toEqual([
      { userId: OWNER, characterId: CHAR, covered: true },
      { userId: OWNER, characterId: CHAR_B, covered: false },
    ]);
  });

  it('returns an empty tracked list when access is revoked (subscription doctrine)', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await grant(t, MAP_A, []);

    const result = await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A });
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
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR,
        lastProcessedTransitionAt: 11,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR_B,
        lastProcessedTransitionAt: 12,
      });
    });

    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);

    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 11 },
    ]);
  });

  it('retains shared bookkeeping through one user revocation and clears it on map teardown', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    for (const userId of [OWNER, EDITOR]) {
      await asUser(t, userId).mutation(tracking.setTracking, {
        mapId: MAP_A, characterId: CHAR, tracked: true,
      });
    }
    await t.run((ctx) => ctx.db.insert('mapJumpBookkeeping', {
      mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
    }));

    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
    ]);
    await grant(t, MAP_A, []);
    expect(await readTracking(t)).toEqual([]);
    expect(await readBookkeeping(t)).toEqual([]);
  });

  it('retains shared bookkeeping through a user purge until the last tracker is purged', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const userId of [OWNER, EDITOR, 'third-user']) {
        await ctx.db.insert('mapTracking', {
          mapId: MAP_A, userId, characterId: CHAR,
        });
      }
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
      });
    });
    for (const userId of [OWNER, EDITOR]) {
      await t.mutation(internal.mapAccessProjection.purgeUserClaims, { userId });
      expect(await readBookkeeping(t)).toEqual([
        { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
      ]);
    }
    await t.mutation(internal.mapAccessProjection.purgeUserClaims, {
      userId: 'third-user',
    });
    expect(await readTracking(t)).toEqual([]);
    expect(await readBookkeeping(t)).toEqual([]);
  });

  it('sweeps every mapTracking row on full map teardown (claims: [])', async () => {
    const t = convexTest(schema, modules);
    await grant(t, MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: MAP_A,
        userId: 'orphaned',
        characterId: CHAR_B,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR,
        lastProcessedTransitionAt: 21,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR_B,
        lastProcessedTransitionAt: 22,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_B,
        characterId: CHAR,
        lastProcessedTransitionAt: 23,
      });
    });

    await grant(t, MAP_A, []);

    expect(await readTracking(t, MAP_A)).toEqual([]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_B, characterId: CHAR, lastProcessedTransitionAt: 23 },
    ]);
  });
});
