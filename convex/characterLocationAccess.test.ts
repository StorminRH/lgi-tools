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
  readDoc,
  USER,
} from './__tests__/characterLocation.setup';

describe('characterLocationAccess.putAccessLease', () => {
  it('does not resurrect a lease after tracking teardown', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.characterLocationAccess.putAccessLease, {
      userId: USER,
      characterId: CHAR_A,
      accessToken: 'tok-late',
      expiresAt: GEN + 1_200_000,
    });
    const leases = await t.run((ctx) => ctx.db.query('characterLocationAccess').collect());
    expect(leases).toEqual([]);
  });

  it('upserts when a mapTracking row still exists', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
    });
    await t.mutation(internal.characterLocationAccess.putAccessLease, {
      userId: USER,
      characterId: CHAR_A,
      accessToken: 'tok-fresh',
      expiresAt: GEN + 1_200_000,
    });
    const lease = await t.run((ctx) =>
      ctx.db
        .query('characterLocationAccess')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', CHAR_A))
        .unique(),
    );
    expect(lease).toMatchObject({ accessToken: 'tok-fresh', expiresAt: GEN + 1_200_000 });
  });
});

describe('characterLocationAccess.clearAccessLease', () => {
  it('deletes only the named character lease and is a no-op when absent', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_B));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await t.mutation(internal.characterLocationAccess.clearAccessLease, {
      userId: USER,
      characterId: CHAR_A,
    });
    await t.mutation(internal.characterLocationAccess.clearAccessLease, {
      userId: USER,
      characterId: CHAR_A,
    });

    const leases = await t.run((ctx) =>
      ctx.db
        .query('characterLocationAccess')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(leases.map((doc) => doc.characterId)).toEqual([CHAR_B]);
    expect(await readDoc(t, CHAR_A)).not.toBeNull();
  });
});
