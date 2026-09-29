// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { JUMP_CONTINUITY_MS } from './characterLocationApply';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import {
  CHAR_A,
  CHAR_B,
  GEN,
  locationDoc,
  readDoc,
  USER,
} from './__tests__/characterLocation.setup';

const NOW = GEN + 1_000;
const WINDOW = GEN + 5_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// The watcher is warm so a finish chains rather than stopping and clearing coverage.
function syncStateRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    runId: GEN,
    jobId: null,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    coveredCharacterIds: [] as number[],
    lastFinishedAt: null as number | null,
    ...overrides,
  };
}

async function seedSyncState(
  t: TestConvex<typeof schema>,
  overrides: Record<string, unknown> = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('locationSync', syncStateRow(overrides));
    await ctx.db.insert('syncPresence', {
      dataset: 'characterLocation',
      userId: USER,
      lastSeenAt: GEN,
      lastVisibleAt: GEN,
    });
  });
}

function readSyncState(t: TestConvex<typeof schema>) {
  return t.run((ctx) =>
    ctx.db
      .query('locationSync')
      .withIndex('by_user', (q) => q.eq('userId', USER))
      .unique(),
  );
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

// Each successful finish chains under a fresh generation, so by default the
// finish claims whatever generation currently owns the state.
async function apply(
  t: TestConvex<typeof schema>,
  args: {
    results: ApplyResult[];
    generation?: number;
    trackedCharacterIds?: number[];
  },
) {
  const generation = args.generation ?? (await readSyncState(t))?.runId ?? GEN;
  return t.mutation(internal.characterLocationApply.finishSync, {
    userId: USER,
    generation,
    outcome: {
      kind: 'success',
      trackedCharacterIds:
        args.trackedCharacterIds ?? args.results.map((r) => r.characterId),
      results: args.results.map((r) => ({
        ...r,
        online: r.online ?? null,
        etagOnline: r.etagOnline ?? null,
        onlineExpiresAt: r.onlineExpiresAt ?? null,
      })),
      runError: null,
      rlGroup: null,
      rlRemaining: null,
    },
    leases: [],
    clearedLeaseCharacterIds: [],
  });
}

describe('characterLocationApply.finishSync (apply)', () => {
  it('no-ops on a generation mismatch', async () => {
    const t = convexTest(schema, modules);
    await seedSyncState(t);
    const state = await readSyncState(t);
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
          online: true,
          etagOnline: 'on',
          onlineExpiresAt: WINDOW,
        },
      ],
    });
    expect(await readDoc(t)).toBeNull();
    expect(await readSyncState(t)).toEqual(state);
    const touched = await t.run(async (ctx) => ({
      online: await ctx.db.query('characterLocationOnline').collect(),
      covered: await ctx.db.query('characterLocationCovered').collect(),
    }));
    expect(touched).toEqual({ online: [], covered: [] });
  });

  it('writes nothing for a 304 unchanged result (stationary zero-write)', async () => {
    const t = convexTest(schema, modules);
    await seedSyncState(t);
    await t.run(async (ctx) => {
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
    expect(after).toEqual(before);
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
    await seedSyncState(t);
    await t.run(async (ctx) => {
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
    expect((await readDoc(t))?.observedAt).toBe(NOW);
  });

  it('stamps prevFresh true when the previous covered run finished 17s ago', async () => {
    const t = convexTest(schema, modules);
    expect(JUMP_CONTINUITY_MS).toBeGreaterThan(17_000);
    await seedSyncState(t, {
      lastFinishedAt: Date.now() - 17_000,
      syncedCharacterIds: [CHAR_A],
      coveredCharacterIds: [CHAR_A],
    });
    await t.run((ctx) => ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A)));

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
    await seedSyncState(t, {
      lastFinishedAt: Date.now() - 60_000,
      syncedCharacterIds: [CHAR_A],
      coveredCharacterIds: [CHAR_A],
    });
    await t.run((ctx) => ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A)));

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
    await seedSyncState(t, {
      lastFinishedAt: Date.now() - 1_000,
      syncedCharacterIds: [CHAR_A],
      coveredCharacterIds: [],
    });
    await t.run((ctx) => ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A)));

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
    await seedSyncState(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
    });

    await apply(t, {
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

    const subject = await readSyncState(t);
    expect(subject?.coveredCharacterIds).toEqual([CHAR_A]);
    expect(subject?.syncedCharacterIds).toEqual([CHAR_A, CHAR_B]);
    expect(subject?.lastFinishedAt).toBe(NOW);
    const covered = await t.run((ctx) =>
      ctx.db
        .query('characterLocationCovered')
        .withIndex('by_user_character', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(covered.map((doc) => doc.characterId)).toEqual([CHAR_A]);
  });

  it('keeps last-known location for a character missing from this run\'s tracked set', async () => {
    const t = convexTest(schema, modules);
    await seedSyncState(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(USER, CHAR_B));
    });

    await apply(t, {
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
      ctx.db.query('characterLocation').withIndex('by_user_character', (q) => q.eq('userId', USER)).collect(),
    );
    expect(remaining.map((d) => d.characterId).sort()).toEqual([CHAR_A, CHAR_B]);
  });

  it('excludes an offline probe result from the covered set (no fabricated continuity)', async () => {
    const t = convexTest(schema, modules);
    await seedSyncState(t);

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

    const subject = await readSyncState(t);
    expect(subject?.coveredCharacterIds).toEqual([CHAR_A]);
  });

  it('keeps held location when the pilot is logged off', async () => {
    const t = convexTest(schema, modules);
    await seedSyncState(t);
    await t.run(async (ctx) => {
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
    await seedSyncState(t);
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
    await seedSyncState(t);
    await t.run(async (ctx) => {
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
      trackedCharacterIds: [CHAR_A],
      results: [],
    });

    const remaining = await t.run((ctx) =>
      ctx.db
        .query('characterLocationOnline')
        .withIndex('by_user_character', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(remaining.map((d) => d.characterId).sort()).toEqual([CHAR_A, CHAR_B]);
  });
});
