// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { JUMP_CONTINUITY_MS } from './characterLocationApply';
import schema from './schema';

import { modules } from './__tests__/modules.setup';

const USER = 'user-location-1';
const OTHER = 'user-location-other';
const CHAR_A = 90_000_101;
const CHAR_B = 90_000_102;
const GEN = 1_700_000_000_000;
const WINDOW = GEN + 5_000;

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
    transitionObservedAt: 1_699_999_999_000,
    observedAt: 1_700_000_000_000,
    etagLocation: 'loc' as string | null,
    etagShip: 'ship' as string | null,
  };
}

function accessLease(userId: string, characterId: number) {
  return {
    userId,
    characterId,
    accessToken: `tok-${characterId}`,
    expiresAt: GEN + 1_200_000,
    updatedAt: GEN,
  };
}

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'characterLocation' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 30_000,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    lastFinishedAt: null as number | null,
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
    ...overrides,
  };
}

type ApplyResult = {
  characterId: number;
  solarSystemId: number | null;
  stationId: number | null;
  structureId: number | null;
  shipTypeId: number | null;
  systemChanged: boolean;
  etagLocation: string | null;
  etagShip: string | null;
  expiresAt: number | null;
  error: string | null;
  online?: boolean | null;
  etagOnline?: string | null;
  onlineExpiresAt?: number | null;
};

function apply(
  t: TestConvex<typeof schema>,
  args: {
    results: ApplyResult[];
    generation?: number;
    enumeratedCharacterIds?: number[];
    trackedCharacterIds?: number[];
  },
) {
  return t.mutation(internal.characterLocationApply.applySyncResults, {
    userId: USER,
    generation: args.generation ?? GEN,
    enumeratedCharacterIds:
      args.enumeratedCharacterIds ?? args.results.map((r) => r.characterId),
    trackedCharacterIds:
      args.trackedCharacterIds ?? args.results.map((r) => r.characterId),
    results: args.results.map((r) => ({
      ...r,
      online: r.online ?? null,
      etagOnline: r.etagOnline ?? null,
      onlineExpiresAt: r.onlineExpiresAt ?? null,
    })),
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
  });
}

function readDoc(t: TestConvex<typeof schema>, characterId = CHAR_A) {
  return t.run((ctx) =>
    ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

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

describe('characterLocationReads.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.characterLocationReads.forViewer, {})).toBeNull();
  });

  it('never exposes an access-token lease on the public viewer query', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(USER, CHAR_A));
    });
    const view = await t.withIdentity({ subject: USER }).query(api.characterLocationReads.forViewer, {});
    expect(JSON.stringify(view)).not.toContain('tok-');
    expect(JSON.stringify(view)).not.toContain('accessToken');
  });

  it('returns the viewer location facts when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });
    const view = await t.withIdentity({ subject: USER }).query(api.characterLocationReads.forViewer, {});
    expect(view?.characters).toEqual([
      {
        characterId: CHAR_A,
        solarSystemId: 30_000_142,
        stationId: null,
        structureId: null,
        shipTypeId: 670,
        prevSolarSystemId: null,
        prevFresh: false,
        transitionObservedAt: 1_699_999_999_000,
        observedAt: 1_700_000_000_000,
      },
    ]);
  });
});

describe('characterLocationReads.heldState', () => {
  it('returns system id, dual etags, and the held online probe in one snapshot', async () => {
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
      await ctx.db.insert('characterLocationOnline', {
        userId: OTHER,
        characterId: CHAR_B,
        online: false,
        etagOnline: null,
        onlineExpiresAt: GEN,
      });
    });
    const held = await t.query(internal.characterLocationReads.heldState, { userId: USER });
    expect(held).toEqual({
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
    });
  });
});

describe('characterLocationApply.applySyncResults', () => {
  it('no-ops on a generation mismatch', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert('syncSubjects', subjectRow()));
    await apply(t, {
      generation: GEN + 1,
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_142,
          stationId: null,
          structureId: null,
          shipTypeId: 670,
          systemChanged: true,
          etagLocation: 'n',
          etagShip: 's',
          expiresAt: WINDOW,
          error: null,
        },
      ],
    });
    expect(await readDoc(t)).toBeNull();
  });

  it('writes nothing for a 304 unchanged result (stationary zero-write)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });
    const before = await readDoc(t);

    await apply(t, {
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: null,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: 'loc',
          etagShip: 'ship',
          expiresAt: WINDOW,
          error: null,
          online: true,
        },
      ],
    });

    const after = await readDoc(t);
    expect(after?._id).toBe(before?._id);
    expect(after?._creationTime).toBe(before?._creationTime);
    expect(after).toMatchObject({
      solarSystemId: 30_000_142,
      shipTypeId: 670,
      etagLocation: 'loc',
      etagShip: 'ship',
    });
  });

  it('advances observedAt for a dock update without advancing the system-transition epoch', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await apply(t, {
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_142,
          stationId: 60_003_760,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: 'loc-docked',
          etagShip: null,
          expiresAt: WINDOW,
          error: null,
        },
      ],
    });

    expect(await readDoc(t)).toMatchObject({
      stationId: 60_003_760,
      transitionObservedAt: 1_699_999_999_000,
      etagLocation: 'loc-docked',
    });
    expect((await readDoc(t))?.observedAt).not.toBe(1_700_000_000_000);
  });

  it('stamps prevFresh true when the previous covered run finished 17s ago', async () => {
    const t = convexTest(schema, modules);
    expect(JUMP_CONTINUITY_MS).toBeGreaterThan(17_000);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({
          lastFinishedAt: Date.now() - 17_000,
          syncedCharacterIds: [CHAR_A],
          coveredCharacterIds: [CHAR_A],
        }),
      );
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await apply(t, {
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_144,
          stationId: null,
          structureId: null,
          shipTypeId: 11_985,
          systemChanged: true,
          etagLocation: 'loc2',
          etagShip: 'ship2',
          expiresAt: WINDOW,
          error: null,
        },
      ],
    });

    expect(await readDoc(t)).toMatchObject({
      solarSystemId: 30_000_144,
      prevSolarSystemId: 30_000_142,
      prevFresh: true,
    });
  });

  it('stamps prevFresh false when the previous run is outside JUMP_CONTINUITY_MS', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({
          lastFinishedAt: Date.now() - 60_000,
          syncedCharacterIds: [CHAR_A],
          coveredCharacterIds: [CHAR_A],
        }),
      );
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await apply(t, {
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_144,
          stationId: null,
          structureId: null,
          shipTypeId: 11_985,
          systemChanged: true,
          etagLocation: 'loc2',
          etagShip: 'ship2',
          expiresAt: WINDOW,
          error: null,
        },
      ],
    });

    expect(await readDoc(t)).toMatchObject({
      solarSystemId: 30_000_144,
      prevSolarSystemId: 30_000_142,
      prevFresh: false,
      shipTypeId: 11_985,
    });
  });

  it('stamps prevFresh false when the previous run did not cover the character', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({
          lastFinishedAt: Date.now() - 1_000,
          syncedCharacterIds: [CHAR_A],
          coveredCharacterIds: [],
        }),
      );
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await apply(t, {
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_144,
          stationId: null,
          structureId: null,
          shipTypeId: 11_985,
          systemChanged: true,
          etagLocation: 'loc2',
          etagShip: 'ship2',
          expiresAt: WINDOW,
          error: null,
        },
      ],
    });

    expect(await readDoc(t)).toMatchObject({
      solarSystemId: 30_000_144,
      prevSolarSystemId: 30_000_142,
      prevFresh: false,
    });
  });

  it('stamps this run\'s covered set from clean results only (304 included)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await apply(t, {
      enumeratedCharacterIds: [CHAR_A, CHAR_B],
      trackedCharacterIds: [CHAR_A, CHAR_B],
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: null,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: 'loc',
          etagShip: 'ship',
          expiresAt: WINDOW,
          error: null,
          online: true,
        },
        {
          characterId: CHAR_B,
          solarSystemId: null,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: null,
          etagShip: null,
          expiresAt: null,
          error: 'reauth_required',
        },
      ],
    });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) =>
          q.eq('userId', USER).eq('dataset', 'characterLocation'),
        )
        .unique(),
    );
    expect(subject?.coveredCharacterIds).toEqual([CHAR_A]);
    expect(subject?.syncedCharacterIds).toEqual([CHAR_A, CHAR_B]);
    const covered = await t.run((ctx) =>
      ctx.db
        .query('characterLocationCovered')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(covered.map((doc) => doc.characterId)).toEqual([CHAR_A]);
  });

  it('keeps last-known location for a character missing from this run\'s tracked set', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_B));
    });

    await apply(t, {
      enumeratedCharacterIds: [CHAR_A],
      trackedCharacterIds: [CHAR_A],
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: null,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: 'loc',
          etagShip: 'ship',
          expiresAt: WINDOW,
          error: null,
        },
      ],
    });

    const remaining = await t.run((ctx) =>
      ctx.db.query('characterLocation').withIndex('by_user', (q) => q.eq('userId', USER)).collect(),
    );
    expect(remaining.map((d) => d.characterId).sort()).toEqual([CHAR_A, CHAR_B]);
  });

  it('excludes an offline probe result from the covered set (no fabricated continuity)', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert('syncSubjects', subjectRow()));

    await apply(t, {
      results: [
        {
          characterId: CHAR_A,
          solarSystemId: 30_000_142,
          stationId: null,
          structureId: null,
          shipTypeId: 670,
          systemChanged: true,
          etagLocation: 'loc',
          etagShip: 'ship',
          expiresAt: WINDOW,
          error: null,
          online: true,
        },
        {
          characterId: CHAR_B,
          solarSystemId: null,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: null,
          etagShip: null,
          expiresAt: WINDOW + 55_000,
          error: null,
          online: false,
          etagOnline: 'on1',
          onlineExpiresAt: WINDOW + 55_000,
        },
      ],
    });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.coveredCharacterIds).toEqual([CHAR_A]);
  });

  it('keeps held location when the pilot is logged off', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_B));
    });

    await apply(t, {
      results: [
        {
          characterId: CHAR_B,
          solarSystemId: null,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          systemChanged: false,
          etagLocation: null,
          etagShip: null,
          expiresAt: WINDOW + 55_000,
          error: null,
          online: false,
          etagOnline: 'on1',
          onlineExpiresAt: WINDOW + 55_000,
        },
      ],
    });

    const remaining = await t.run((ctx) =>
      ctx.db
        .query('characterLocation')
        .withIndex('by_user_character', (q) =>
          q.eq('userId', USER).eq('characterId', CHAR_B),
        )
        .unique(),
    );
    expect(remaining).toMatchObject({
      characterId: CHAR_B,
      solarSystemId: locationDoc(USER, CHAR_B).solarSystemId,
    });
  });

  it('upserts the held online-probe row only on a fresh probe read', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert('syncSubjects', subjectRow()));
    const offlineResult = {
      characterId: CHAR_A,
      solarSystemId: null as number | null,
      stationId: null,
      structureId: null,
      shipTypeId: null,
      systemChanged: false,
      etagLocation: null,
      etagShip: null,
      expiresAt: WINDOW + 55_000,
      error: null,
    };

    await apply(t, {
      results: [{ ...offlineResult, online: false, etagOnline: 'on1', onlineExpiresAt: WINDOW + 55_000 }],
    });
    const coveredAfterOffline = await t.run((ctx) =>
      ctx.db
        .query('characterLocationCovered')
        .withIndex('by_user_character', (q) =>
          q.eq('userId', USER).eq('characterId', CHAR_A),
        )
        .unique(),
    );
    expect(coveredAfterOffline).toBeNull();
    const readRow = () =>
      t.run((ctx) =>
        ctx.db
          .query('characterLocationOnline')
          .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', CHAR_A))
          .unique(),
      );
    const inserted = await readRow();
    expect(inserted).toMatchObject({ online: false, etagOnline: 'on1', onlineExpiresAt: WINDOW + 55_000 });

    await apply(t, { results: [{ ...offlineResult }] });
    expect((await readRow())?.onlineExpiresAt).toBe(WINDOW + 55_000);

    await apply(t, {
      results: [{ ...offlineResult, online: true, etagOnline: 'on2', onlineExpiresAt: WINDOW + 115_000 }],
    });
    const patched = await readRow();
    expect(patched?._id).toBe(inserted?._id);
    expect(patched).toMatchObject({ online: true, etagOnline: 'on2', onlineExpiresAt: WINDOW + 115_000 });
  });

  it('keeps held online-probe rows for a character missing from this run\'s tracked set', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      for (const characterId of [CHAR_A, CHAR_B]) {
        await ctx.db.insert('characterLocationOnline', {
          userId: USER,
          characterId,
          online: true,
          etagOnline: null,
          onlineExpiresAt: WINDOW,
        });
      }
    });

    await apply(t, {
      enumeratedCharacterIds: [CHAR_A],
      trackedCharacterIds: [CHAR_A],
      results: [],
    });

    const remaining = await t.run((ctx) =>
      ctx.db
        .query('characterLocationOnline')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(remaining.map((d) => d.characterId).sort()).toEqual([CHAR_A, CHAR_B]);
  });

});
