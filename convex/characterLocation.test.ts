// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { JUMP_CONTINUITY_MS } from './characterLocation';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user-location-1';
const OTHER = 'user-location-other';
const CHAR_A = 90_000_101;
const CHAR_B = 90_000_102;
const SECRET = 'svc-secret-location';
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
  // Probe trio, defaulted by apply(): null-null-null = "probe not exercised",
  // which leaves characterLocationOnline untouched — existing location cases
  // stay byte-identical.
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
  return t.mutation(internal.characterLocation.applySyncResults, {
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('characterLocation.purgeForUser', () => {
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
      // Character-keyed exactly-once stamps: the account purge must drain the
      // purged characters' stamps across maps (no userId column to key on).
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
    });

    const out = await t.mutation(internal.characterLocation.purgeForUser, {
      userId: USER,
      characterId: null,
    });
    expect(out).toEqual({ deletedLocations: 2, deletedTracking: 2, deletedBookkeeping: 2 });

    const remainingLocations = await t.run((ctx) => ctx.db.query('characterLocation').collect());
    const remainingTracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    const remainingOnline = await t.run((ctx) => ctx.db.query('characterLocationOnline').collect());
    expect(remainingLocations.map((doc) => doc.userId)).toEqual([OTHER]);
    expect(remainingTracking.map((doc) => doc.userId)).toEqual([OTHER]);
    // Held probe rows leave with the account — same door, same cascade.
    expect(remainingOnline.map((doc) => doc.userId)).toEqual([OTHER]);
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
    });

    const out = await t.mutation(internal.characterLocation.purgeForUser, {
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
  });

  it('is a no-op when there is nothing to delete', async () => {
    const t = convexTest(schema, modules);
    const out = await t.mutation(internal.characterLocation.purgeForUser, {
      userId: USER,
      characterId: null,
    });
    expect(out).toEqual({ deletedLocations: 0, deletedTracking: 0, deletedBookkeeping: 0 });
  });
});

describe('POST /purge-location-tracking', () => {
  it('rejects a request without the service bearer token', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await convexTest(schema, modules).fetch('/purge-location-tracking', {
      method: 'POST',
      body: JSON.stringify({ userId: USER, characterId: null }),
    });
    expect(res.status).toBe(401);
  });

  it('returns a clean 400 for a malformed body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await convexTest(schema, modules).fetch('/purge-location-tracking', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('empties both tables for the user when characterId is null', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('mapTracking', {
        mapId: 'map-a',
        userId: USER,
        characterId: CHAR_A,
      });
    });

    const res = await t.fetch('/purge-location-tracking', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ userId: USER, characterId: null }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedLocations: 1, deletedTracking: 1, deletedBookkeeping: 0 });

    const locations = await t.run((ctx) => ctx.db.query('characterLocation').collect());
    const tracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    expect(locations).toEqual([]);
    expect(tracking).toEqual([]);
  });
});

describe('characterLocation.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.characterLocation.forViewer, {})).toBeNull();
  });

  it('returns the viewer location facts when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });
    const view = await t.withIdentity({ subject: USER }).query(api.characterLocation.forViewer, {});
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

describe('characterLocation.heldState', () => {
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
      // Another user's rows never leak into the read seam.
      await ctx.db.insert('characterLocationOnline', {
        userId: OTHER,
        characterId: CHAR_B,
        online: false,
        etagOnline: null,
        onlineExpiresAt: GEN,
      });
    });
    const held = await t.query(internal.characterLocation.heldState, { userId: USER });
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

describe('characterLocation.applySyncResults', () => {
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
    // Live sitting-then-jump: lastFinishedAt was 17s before apply, character
    // still in coveredCharacterIds. The old 15s window stamped prevFresh
    // false and the doorbell skipped re-anchor.
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
          // Covered too — proving the stale WINDOW alone forces the re-anchor.
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
    // Recent finish AND tracked, but the character's last sample was an error /
    // unpolled (not in coveredCharacterIds): the transition must re-anchor —
    // PD-2's "no invented path" — never inherit jump provenance from the
    // tracked set.
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
          // 304 with the pilot online — a clean LOCATION observation, counts
          // as covered despite writing nothing.
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
          // Errored — excluded from the covered set.
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
  });

  it('orphan-cleans a character no longer in the Neon enumeration', async () => {
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
    expect(remaining.map((d) => d.characterId)).toEqual([CHAR_A]);
  });

  it('excludes an offline probe result from the covered set (no fabricated continuity)', async () => {
    // Two tracked pilots: A online (location observed), B logged off under a
    // held probe. B must NOT enter coveredCharacterIds — if it did, a login +
    // multi-hop move inside the held ~60s window would satisfy isPrevFresh on
    // the next run and author a fabricated jump on the shared map.
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

    // Fresh read → insert.
    await apply(t, {
      results: [{ ...offlineResult, online: false, etagOnline: 'on1', onlineExpiresAt: WINDOW + 55_000 }],
    });
    const readRow = () =>
      t.run((ctx) =>
        ctx.db
          .query('characterLocationOnline')
          .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', CHAR_A))
          .unique(),
      );
    const inserted = await readRow();
    expect(inserted).toMatchObject({ online: false, etagOnline: 'on1', onlineExpiresAt: WINDOW + 55_000 });

    // Held-reuse (null trio) → untouched.
    await apply(t, { results: [{ ...offlineResult }] });
    expect((await readRow())?.onlineExpiresAt).toBe(WINDOW + 55_000);

    // A later fresh read with a moved window → patched in place.
    await apply(t, {
      results: [{ ...offlineResult, online: true, etagOnline: 'on2', onlineExpiresAt: WINDOW + 115_000 }],
    });
    const patched = await readRow();
    expect(patched?._id).toBe(inserted?._id);
    expect(patched).toMatchObject({ online: true, etagOnline: 'on2', onlineExpiresAt: WINDOW + 115_000 });
  });

  it('orphan-cleans held online-probe rows alongside location docs', async () => {
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
    expect(remaining.map((d) => d.characterId)).toEqual([CHAR_A]);
  });

});
