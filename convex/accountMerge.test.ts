// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { accessLease, CHAR_A, CHAR_B, locationDoc } from './__tests__/characterLocation.setup';

const SOURCE = 'user-source';
const SURVIVOR = 'user-survivor';
const BYSTANDER = 'user-bystander';
const CHAR_C = 90_000_103;

async function readTracking(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query('mapTracking').collect();
    return rows
      .map((row) => ({ mapId: row.mapId, userId: row.userId, characterId: row.characterId }))
      .sort(
        (left, right) =>
          left.mapId.localeCompare(right.mapId) ||
          left.userId.localeCompare(right.userId) ||
          left.characterId - right.characterId,
      );
  });
}

describe('accountMerge.mergeUserState', () => {
  it('moves tracking intent onto the survivor, dedupes shared pairs, drops past the cap, and drains the source', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'map-move', userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-move', userId: SOURCE, characterId: CHAR_B });
      await ctx.db.insert('mapTracking', { mapId: 'map-dup', userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-dup', userId: SURVIVOR, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-dup', userId: BYSTANDER, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-full', userId: SOURCE, characterId: CHAR_C });
      for (let index = 0; index < TRACKED_CHARACTERS_PER_MAP_USER_CAP; index += 1) {
        await ctx.db.insert('mapTracking', { mapId: 'map-full', userId: SURVIVOR, characterId: 1000 + index });
      }
      await ctx.db.insert('mapJumpBookkeeping', { mapId: 'map-dup', characterId: CHAR_A, lastProcessedTransitionAt: 1 });
      await ctx.db.insert('mapJumpBookkeeping', { mapId: 'map-full', characterId: CHAR_C, lastProcessedTransitionAt: 2 });
      await ctx.db.insert('mapAccess', { mapId: 'map-move', userId: SOURCE, roles: ['viewer'] });
      await ctx.db.insert('mapAccess', { mapId: 'map-move', userId: SURVIVOR, roles: ['admin'] });
      await ctx.db.insert('characterLocation', locationDoc(SOURCE, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(SURVIVOR, CHAR_C));
      await ctx.db.insert('characterLocationAccess', accessLease(SOURCE, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(SURVIVOR, CHAR_C));
      await ctx.db.insert('characterLocationCovered', { userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('characterLocationOnline', {
        userId: SOURCE, characterId: CHAR_A, online: true, etagOnline: null, onlineExpiresAt: 1,
      });
    });

    const out = await t.mutation(internal.accountMerge.mergeUserState, {
      sourceUserId: SOURCE,
      survivorUserId: SURVIVOR,
    });

    expect(out).toEqual({ trackingMoved: 2, trackingDropped: 1, deleted: 3 });
    expect(await readTracking(t)).toEqual([
      { mapId: 'map-dup', userId: BYSTANDER, characterId: CHAR_A },
      { mapId: 'map-dup', userId: SURVIVOR, characterId: CHAR_A },
      ...Array.from({ length: TRACKED_CHARACTERS_PER_MAP_USER_CAP }, (_, index) => ({
        mapId: 'map-full', userId: SURVIVOR, characterId: 1000 + index,
      })),
      { mapId: 'map-move', userId: SURVIVOR, characterId: CHAR_A },
      { mapId: 'map-move', userId: SURVIVOR, characterId: CHAR_B },
    ]);
    const after = await t.run(async (ctx) => ({
      bookkeeping: (await ctx.db.query('mapJumpBookkeeping').collect()).map((row) => row.mapId),
      claims: (await ctx.db.query('mapAccess').collect()).map((row) => `${row.mapId}:${row.userId}`),
      locations: (await ctx.db.query('characterLocation').collect()).map((row) => row.userId),
      leases: (await ctx.db.query('characterLocationAccess').collect()).map((row) => row.userId),
      covered: (await ctx.db.query('characterLocationCovered').collect()).map((row) => row.userId),
      online: (await ctx.db.query('characterLocationOnline').collect()).map((row) => row.userId),
    }));
    expect(after).toEqual({
      bookkeeping: ['map-dup'],
      claims: ['map-move:user-survivor'],
      locations: [SURVIVOR],
      leases: [SURVIVOR],
      covered: [],
      online: [],
    });

    await expect(
      t.mutation(internal.accountMerge.mergeUserState, { sourceUserId: SOURCE, survivorUserId: SURVIVOR }),
    ).resolves.toEqual({ trackingMoved: 0, trackingDropped: 0, deleted: 0 });
    expect((await readTracking(t)).filter((row) => row.userId === SURVIVOR)).toHaveLength(
      TRACKED_CHARACTERS_PER_MAP_USER_CAP + 3,
    );
  });
});
