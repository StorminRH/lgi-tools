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

describe('characterLocationReads.syncInputs', () => {
  it('returns tracked ids, system id, dual etags, the held online probe, and leases in one snapshot', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // The same character tracked on two maps is enumerated once.
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: USER, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-b', userId: USER, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: OTHER, characterId: CHAR_B });
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(OTHER, CHAR_B));
      await ctx.db.insert('characterLocationOnline', {
        userId: USER,
        characterId: CHAR_A,
        online: true,
        etagOnline: 'on',
        onlineExpiresAt: GEN + 60_000,
      });
      await ctx.db.insert('characterLocationOnline', {
        userId: OTHER,
        characterId: CHAR_B,
        online: false,
        etagOnline: null,
        onlineExpiresAt: GEN,
      });
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(OTHER, CHAR_B));
    });
    const inputs = await t.query(internal.characterLocationReads.syncInputs, { userId: USER });
    expect(inputs).toEqual({
      trackedIds: [CHAR_A],
      locations: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_142,
          etagLocation: 'loc',
          etagShip: 'ship',
        },
      ],
      online: [
        {
          characterId: CHAR_A,
          online: true,
          etagOnline: 'on',
          onlineExpiresAt: GEN + 60_000,
        },
      ],
      leases: [
        { characterId: CHAR_A, accessToken: `tok-${CHAR_A}`, expiresAt: GEN + 1_200_000 },
      ],
    });
  });

  it('syncs distinct pilots when valid memberships across maps exceed 1024', async () => {
    const t = convexTest(schema, modules);
    const characterIds = Array.from({ length: 32 }, (_, index) => CHAR_A + index);
    await t.run(async (ctx) => {
      for (let map = 0; map < 33; map += 1) {
        for (const characterId of characterIds) {
          await ctx.db.insert('mapTracking', { mapId: `map-${map}`, userId: USER, characterId });
        }
      }
      await ctx.db.insert('mapTracking', { mapId: 'other-map', userId: OTHER, characterId: CHAR_B });
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });
    const inputs = await t.query(internal.characterLocationReads.syncInputs, { userId: USER });
    expect(inputs.trackedIds).toEqual(characterIds);
    expect(inputs.locations).toEqual([expect.objectContaining({ characterId: CHAR_A })]);
  });

  it('returns empty arrays for an untracked user even when held rows remain', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocationOnline', {
        userId: USER,
        characterId: CHAR_A,
        online: true,
        etagOnline: 'on',
        onlineExpiresAt: GEN + 60_000,
      });
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
    });
    const inputs = await t.query(internal.characterLocationReads.syncInputs, { userId: USER });
    expect(inputs).toEqual({ trackedIds: [], locations: [], online: [], leases: [] });
  });
});
