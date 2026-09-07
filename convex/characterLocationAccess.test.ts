// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { newIdleSubject } from './lib/subjects';
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

function seedSubject(t: TestConvex<typeof schema>, generation = GEN) {
  return t.run((ctx) => ctx.db.insert('syncSubjects', {
    ...newIdleSubject('characterLocation', USER), lastRequestedAt: generation,
  }));
}

function seedTracking(t: TestConvex<typeof schema>) {
  return t.run((ctx) => ctx.db.insert('mapTracking', {
    mapId: 'map-a', userId: USER, characterId: CHAR_A,
  }));
}

function putLease(t: TestConvex<typeof schema>, generation: number, accessToken: string) {
  return t.mutation(internal.characterLocationAccess.putAccessLeases, {
    userId: USER,
    generation,
    leases: [{ characterId: CHAR_A, accessToken, expiresAt: GEN + 1_200_000 }],
  });
}

function readLeases(t: TestConvex<typeof schema>) {
  return t.query(internal.characterLocationAccess.accessLeases, { userId: USER });
}

describe('characterLocationAccess.putAccessLeases', () => {
  it('upserts tracked characters and skips untracked ones in one batch', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await putLease(t, GEN, 'tok-old');
    await t.mutation(internal.characterLocationAccess.putAccessLeases, {
      userId: USER,
      generation: GEN,
      leases: [
        { characterId: CHAR_A, accessToken: 'tok-a', expiresAt: GEN + 1_200_000 },
        { characterId: CHAR_B, accessToken: 'tok-b', expiresAt: GEN + 1_200_000 },
      ],
    });
    expect(await readLeases(t)).toEqual([
      { characterId: CHAR_A, accessToken: 'tok-a', expiresAt: GEN + 1_200_000 },
    ]);
  });

  it('does not resurrect a lease after tracking teardown', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await putLease(t, GEN, 'tok-late');
    expect(await readLeases(t)).toEqual([]);
  });

  it.each([false, true])('ignores an old batch after a newer run stores its token, then clears: %s', async (clear) => {
    const t = convexTest(schema, modules);
    const subjectId = await seedSubject(t);
    await seedTracking(t);
    await putLease(t, GEN, 'tok-old');
    await t.run((ctx) => ctx.db.patch(subjectId, { lastRequestedAt: GEN + 1 }));
    await putLease(t, GEN + 1, 'tok-new');
    if (clear) {
      await t.mutation(internal.characterLocationAccess.clearAccessLease, {
        userId: USER, characterId: CHAR_A, generation: GEN + 1,
      });
    }

    await putLease(t, GEN, 'tok-old');

    expect(await readLeases(t)).toEqual(clear ? [] : [
      { characterId: CHAR_A, accessToken: 'tok-new', expiresAt: GEN + 1_200_000 },
    ]);
  });
});

describe('characterLocationAccess.clearAccessLease', () => {
  it('deletes only the named character lease and is a no-op when absent', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_B));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await t.mutation(internal.characterLocationAccess.clearAccessLease, {
      userId: USER, characterId: CHAR_A, generation: GEN,
    });
    await t.mutation(internal.characterLocationAccess.clearAccessLease, {
      userId: USER, characterId: CHAR_A, generation: GEN,
    });

    expect((await readLeases(t)).map((doc) => doc.characterId)).toEqual([CHAR_B]);
    expect(await readDoc(t, CHAR_A)).not.toBeNull();
  });

  it('preserves the newer run token when an older run rejects its held token', async () => {
    const t = convexTest(schema, modules);
    const subjectId = await seedSubject(t);
    await seedTracking(t);
    await putLease(t, GEN, 'tok-old');
    await t.run((ctx) => ctx.db.patch(subjectId, { lastRequestedAt: GEN + 1 }));
    await putLease(t, GEN + 1, 'tok-new');

    await t.mutation(internal.characterLocationAccess.clearAccessLease, {
      userId: USER, characterId: CHAR_A, generation: GEN,
    });

    expect(await readLeases(t)).toEqual([
      { characterId: CHAR_A, accessToken: 'tok-new', expiresAt: GEN + 1_200_000 },
    ]);
  });

  it('leaves leases unchanged when the sync subject is absent', async () => {
    const t = convexTest(schema, modules);
    await seedTracking(t);
    await putLease(t, GEN, 'tok-late');
    expect(await readLeases(t)).toEqual([]);
    await t.run((ctx) => ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A)));
    const before = await readLeases(t);

    await t.mutation(internal.characterLocationAccess.clearAccessLease, {
      userId: USER, characterId: CHAR_A, generation: GEN,
    });
    await putLease(t, GEN, 'tok-late');

    expect(await readLeases(t)).toEqual(before);
  });
});
