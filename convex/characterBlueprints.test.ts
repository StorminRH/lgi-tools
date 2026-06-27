// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

// The sync action is covered separately (characterBlueprintsSync.test.ts); this
// file covers the SA.5 cold/hot client seams (forViewer / runStateForViewer),
// heldState, and applySyncResults (cold/hot/subject writes, the generation guard,
// orphan cleanup, the deep-equal cold-skip).
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_char_bp_1';
const GEN = 1_700_000_000_000;

function bp(overrides: Record<string, unknown> = {}) {
  return {
    type_id: 1000,
    material_efficiency: 10,
    time_efficiency: 20,
    runs: -1,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'characterBlueprints' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 3_600_000,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    lastFinishedAt: null,
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
    ...overrides,
  };
}

function readDocs(t: TestConvex<typeof schema>, characterId: number) {
  return t.run(async (ctx) => ({
    hot: await ctx.db
      .query('characterBlueprintsSync')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
    cold: await ctx.db
      .query('characterBlueprintsSyncData')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  }));
}

function readSubject(t: TestConvex<typeof schema>) {
  return t.run((ctx) =>
    ctx.db
      .query('syncSubjects')
      .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterBlueprints'))
      .unique(),
  );
}

describe('characterBlueprints.forViewer (cold payload)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.characterBlueprints.forViewer, {})).toBe(null);
  });

  it('returns the viewer characters payload when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 101,
        data: { blueprints: [bp()] },
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.characterBlueprints.forViewer, {});
    expect(view?.characters).toEqual([{ characterId: 101, data: { blueprints: [bp()] } }]);
  });
});

describe('characterBlueprints.runStateForViewer (hot run state)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.characterBlueprints.runStateForViewer, {})).toBe(null);
  });

  it('returns per-character freshness and the sync state when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ status: 'idle', lastFinishedAt: GEN }));
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 101,
        etags: ['e1'],
        lastSyncedAt: GEN,
        expiresAt: GEN + 3_600_000,
        syncError: null,
      });
    });

    const view = await t
      .withIdentity({ subject: USER })
      .query(api.characterBlueprints.runStateForViewer, {});
    expect(view?.characters).toEqual([{ characterId: 101, lastSyncedAt: GEN, syncError: null }]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('characterBlueprints.heldState', () => {
  it('offers per-page etags only beside a stored cold payload', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 101,
        etags: ['e1', 'e2'],
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 101,
        data: { blueprints: [bp()] },
      });
      // char 202: hot etags but NO cold doc (errored first read) → withheld.
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 202,
        etags: ['eX'],
        lastSyncedAt: null,
        expiresAt: null,
        syncError: 'esi_500',
      });
    });

    const held = await t.run((ctx) =>
      ctx.runQuery(internal.characterBlueprints.heldState, { userId: USER }),
    );
    expect(held).toEqual([
      { characterId: 101, etags: ['e1', 'e2'] },
      { characterId: 202, etags: [] },
    ]);
  });
});

describe('characterBlueprints.applySyncResults', () => {
  it('writes the payload to the cold doc, meta to the hot doc, and stamps the subject', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
    });

    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          blueprints: [bp()],
          etags: ['e1'],
          expiresAt: GEN + 3_600_000,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: 'char-blueprints',
      rlLimit: 600,
      rlRemaining: 599,
      rlUsed: 1,
    });

    const { hot, cold } = await readDocs(t, 101);
    expect(cold?.data).toEqual({ blueprints: [bp()] });
    expect(hot?.etags).toEqual(['e1']);
    expect(hot?.expiresAt).toBe(GEN + 3_600_000);
    expect(hot?.syncError).toBeNull();
    expect(typeof hot?.lastSyncedAt).toBe('number');

    const subject = await readSubject(t);
    expect(subject?.minExpiresAt).toBe(GEN + 3_600_000);
    expect(subject?.syncedCharacterIds).toEqual([101]);
    expect(subject?.rlGroup).toBe('char-blueprints');
  });

  it('keeps the held payload and bumps freshness on a 304 (blueprints null)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 101,
        etags: ['e1'],
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 101,
        data: { blueprints: [bp()] },
      });
    });

    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        { characterId: 101, blueprints: null, etags: ['e1'], expiresAt: GEN + 3_600_000, error: null },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { hot, cold } = await readDocs(t, 101);
    expect(cold?.data).toEqual({ blueprints: [bp()] });
    expect((hot?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
    expect(hot?.expiresAt).toBe(GEN + 3_600_000);
  });

  it('rewrites the cold doc only when the projected set changed', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 101,
        etags: ['e1'],
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 101,
        data: { blueprints: [bp()] },
      });
    });

    // Identical fresh body → the deep-equal cold-skip path runs (the value stays).
    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        { characterId: 101, blueprints: [bp()], etags: ['e1'], expiresAt: GEN, error: null },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });
    expect((await readDocs(t, 101)).cold?.data).toEqual({ blueprints: [bp()] });

    // Changed fresh body → the cold doc is updated.
    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          blueprints: [bp({ material_efficiency: 8 })],
          etags: ['e2'],
          expiresAt: GEN,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });
    expect((await readDocs(t, 101)).cold?.data).toEqual({
      blueprints: [bp({ material_efficiency: 8 })],
    });
  });

  it('keeps the payload but clears the window on an errored result', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 101,
        etags: ['e1'],
        lastSyncedAt: GEN,
        expiresAt: GEN + 1000,
        syncError: null,
      });
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 101,
        data: { blueprints: [bp()] },
      });
    });

    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        { characterId: 101, blueprints: null, etags: ['e1'], expiresAt: null, error: 'esi_500' },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { hot, cold } = await readDocs(t, 101);
    expect(cold?.data).toEqual({ blueprints: [bp()] });
    expect(hot?.syncError).toBe('esi_500');
    expect(hot?.expiresAt).toBeNull();
  });

  it('orphan-cleans both halves of a character no longer enumerated', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 999,
        etags: ['old'],
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 999,
        data: { blueprints: [bp()] },
      });
    });

    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101], // 999 is gone
      results: [
        { characterId: 101, blueprints: [bp()], etags: ['e1'], expiresAt: GEN, error: null },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const orphan = await readDocs(t, 999);
    expect(orphan.hot).toBeNull();
    expect(orphan.cold).toBeNull();
    expect((await readDocs(t, 101)).cold?.data).toEqual({ blueprints: [bp()] });
  });

  it('no-ops when the generation token does not match the subject', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ lastRequestedAt: GEN }));
    });

    await t.mutation(internal.characterBlueprints.applySyncResults, {
      userId: USER,
      generation: GEN + 999,
      enumeratedCharacterIds: [101],
      results: [
        { characterId: 101, blueprints: [bp()], etags: ['e1'], expiresAt: GEN, error: null },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { hot, cold } = await readDocs(t, 101);
    expect(hot).toBeNull();
    expect(cold).toBeNull();
    expect((await readSubject(t))?.syncedCharacterIds).toEqual([]);
  });
});
