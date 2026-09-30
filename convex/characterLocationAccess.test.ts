// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { clearAccessLeases, writeAccessLeases } from './characterLocationAccess';
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

afterEach(() => {
  vi.restoreAllMocks();
});

function seedTracking(t: TestConvex<typeof schema>, characterId = CHAR_A) {
  return t.run((ctx) => ctx.db.insert('mapTracking', {
    mapId: 'map-a', userId: USER, characterId,
  }));
}

function seedSyncState(t: TestConvex<typeof schema>, runId = GEN) {
  return t.run((ctx) => ctx.db.insert('locationSync', {
    userId: USER,
    runId,
    jobId: null,
    minExpiresAt: null,
    syncedCharacterIds: [],
    coveredCharacterIds: [],
    lastFinishedAt: null,
  }));
}

function putLease(t: TestConvex<typeof schema>, accessToken: string, characterId = CHAR_A) {
  return t.run((ctx) => writeAccessLeases(
    ctx,
    USER,
    [{ characterId, accessToken, expiresAt: GEN + 1_200_000 }],
    GEN,
  ));
}

function readLeases(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) => q.eq('userId', USER))
      .collect();
    return rows.map(({ characterId, accessToken, expiresAt }) => ({
      characterId, accessToken, expiresAt,
    }));
  });
}

// A failed outcome keeps finishSync to its lease writes and one state stamp.
function finish(
  t: TestConvex<typeof schema>,
  generation: number,
  changes: { accessToken?: string; cleared?: number[] },
) {
  return t.mutation(internal.characterLocationApply.finishSync, {
    userId: USER,
    generation,
    outcome: { kind: 'failed', error: 'esi_down' },
    leases: changes.accessToken === undefined
      ? []
      : [{ characterId: CHAR_A, accessToken: changes.accessToken, expiresAt: GEN + 1_200_000 }],
    clearedLeaseCharacterIds: changes.cleared ?? [],
  });
}

describe('characterLocationAccess.writeAccessLeases', () => {
  it('upserts tracked characters, skips untracked ones, and does not resurrect a lease after teardown', async () => {
    const tracked = convexTest(schema, modules);
    await seedTracking(tracked);
    await putLease(tracked, 'tok-old');
    await tracked.run((ctx) => writeAccessLeases(ctx, USER, [
      { characterId: CHAR_A, accessToken: 'tok-a', expiresAt: GEN + 1_200_000 },
      { characterId: CHAR_B, accessToken: 'tok-b', expiresAt: GEN + 1_200_000 },
    ], GEN + 1));
    expect(await readLeases(tracked)).toEqual([
      { characterId: CHAR_A, accessToken: 'tok-a', expiresAt: GEN + 1_200_000 },
    ]);
    const rows = await tracked.run((ctx) => ctx.db.query('characterLocationAccess').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updatedAt).toBe(GEN + 1);

    const tornDown = convexTest(schema, modules);
    await putLease(tornDown, 'tok-late');
    expect(await readLeases(tornDown)).toEqual([]);
  });
});

describe('characterLocationAccess.clearAccessLeases', () => {
  it('deletes only the named character leases and is a no-op when absent', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_B));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await t.run((ctx) => clearAccessLeases(ctx, USER, [CHAR_A]));
    await t.run((ctx) => clearAccessLeases(ctx, USER, [CHAR_A]));

    expect((await readLeases(t)).map((doc) => doc.characterId)).toEqual([CHAR_B]);
    expect(await readDoc(t, CHAR_A)).not.toBeNull();
  });
});

describe('finishSync lease generation guard', () => {
  it('persists vended leases and clears rejected ones for the owning generation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = convexTest(schema, modules);
    await seedSyncState(t);
    await seedTracking(t);
    await seedTracking(t, CHAR_B);
    await t.run((ctx) => ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_B)));

    await finish(t, GEN, { accessToken: 'tok-new', cleared: [CHAR_B] });

    expect(await readLeases(t)).toEqual([
      { characterId: CHAR_A, accessToken: 'tok-new', expiresAt: GEN + 1_200_000 },
    ]);
  });

  it.each([false, true])('ignores a stale-generation finish after a newer run stores its token, clears: %s', async (clear) => {
    const t = convexTest(schema, modules);
    await seedSyncState(t, GEN + 1);
    await seedTracking(t);
    await putLease(t, 'tok-new');

    await finish(t, GEN, clear ? { cleared: [CHAR_A] } : { accessToken: 'tok-old' });

    expect(await readLeases(t)).toEqual([
      { characterId: CHAR_A, accessToken: 'tok-new', expiresAt: GEN + 1_200_000 },
    ]);
  });

  it('leaves leases unchanged when the sync state is absent', async () => {
    const t = convexTest(schema, modules);
    await seedTracking(t);
    await t.run((ctx) => ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A)));
    const before = await readLeases(t);

    await finish(t, GEN, { cleared: [CHAR_A] });
    await finish(t, GEN, { accessToken: 'tok-late' });

    expect(await readLeases(t)).toEqual(before);
  });
});
