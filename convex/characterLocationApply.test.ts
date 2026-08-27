// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
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

const WINDOW = GEN + 5_000;

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
