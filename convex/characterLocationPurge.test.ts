// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import {
  accessLease,
  CHAR_A,
  CHAR_B,
  GEN,
  locationDoc,
  OTHER,
  USER,
} from './__tests__/characterLocation.setup';

describe('characterLocationPurge.purgeForUser', () => {
  it('deletes every characterLocation doc and mapTracking row for the user when characterId is null', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_B));
      await ctx.db.insert('characterLocation', locationDoc(OTHER, CHAR_A));
      for (const [userId, characterId] of [[USER, CHAR_A], [USER, CHAR_B], [OTHER, CHAR_A]] as const) {
        await ctx.db.insert('characterLocationOnline', {
          userId,
          characterId,
          online: true,
          etagOnline: null,
          onlineExpiresAt: GEN + 60_000,
        });
      }
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
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-a',
        characterId: CHAR_A,
        lastProcessedTransitionAt: 1,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-b',
        characterId: CHAR_B,
        lastProcessedTransitionAt: 2,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-a',
        characterId: 90_999_999,
        lastProcessedTransitionAt: 3,
      });
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_B));
      await ctx.db.insert('characterLocationAccess', accessLease(OTHER, CHAR_A));
      await ctx.db.insert('characterLocationCovered', { userId: USER, characterId: CHAR_A });
      await ctx.db.insert('characterLocationCovered', { userId: USER, characterId: CHAR_B });
      await ctx.db.insert('characterLocationCovered', { userId: OTHER, characterId: CHAR_A });
    });

    const out = await t.mutation(internal.characterLocationPurge.purgeForUser, {
      userId: USER,
      characterId: null,
    });
    expect(out).toEqual({ deletedLocations: 2, deletedTracking: 2, deletedBookkeeping: 2 });

    const remainingLocations = await t.run((ctx) => ctx.db.query('characterLocation').collect());
    const remainingTracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    const remainingOnline = await t.run((ctx) => ctx.db.query('characterLocationOnline').collect());
    const remainingLeases = await t.run((ctx) => ctx.db.query('characterLocationAccess').collect());
    const remainingCovered = await t.run((ctx) => ctx.db.query('characterLocationCovered').collect());
    expect(remainingLocations.map((doc) => doc.userId)).toEqual([OTHER]);
    expect(remainingTracking.map((doc) => doc.userId)).toEqual([OTHER]);
    expect(remainingOnline.map((doc) => doc.userId)).toEqual([OTHER]);
    expect(remainingLeases.map((doc) => doc.userId)).toEqual([OTHER]);
    expect(remainingCovered.map((doc) => doc.userId)).toEqual([OTHER]);
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
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-a',
        characterId: CHAR_A,
        lastProcessedTransitionAt: 1,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-a',
        characterId: CHAR_B,
        lastProcessedTransitionAt: 2,
      });
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_B));
    });

    const out = await t.mutation(internal.characterLocationPurge.purgeForUser, {
      userId: USER,
      characterId: CHAR_A,
    });
    expect(out).toEqual({ deletedLocations: 1, deletedTracking: 1, deletedBookkeeping: 1 });

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
    const leases = await t.run((ctx) =>
      ctx.db
        .query('characterLocationAccess')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(leases.map((doc) => doc.characterId)).toEqual([CHAR_B]);
  });

  it('is a no-op when there is nothing to delete', async () => {
    const t = convexTest(schema, modules);
    const out = await t.mutation(internal.characterLocationPurge.purgeForUser, {
      userId: USER,
      characterId: null,
    });
    expect(out).toEqual({ deletedLocations: 0, deletedTracking: 0, deletedBookkeeping: 0 });
  });
});
