// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

// The corp dataset's queries + apply. The sync action is covered separately
// (corpBlueprintsSync.test.ts); this file covers forViewer / runStateForViewer
// (the SA.5 cold/hot client seams), heldState, and applySyncResults (the
// corp-keyed write delegating to applyCorpDataset — fresh upsert, the
// needs_role cold drop, orphan cleanup, and the incomplete-run retention).
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_corp_bp_1';
const CORP = 2000;
const GEN = 1_700_000_000_000;

function bp(overrides: Record<string, unknown> = {}) {
  return {
    type_id: 1000,
    material_efficiency: 10,
    time_efficiency: 20,
    runs: -1,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'CorpSAG1',
    ...overrides,
  };
}

function seedSubject(t: TestConvex<typeof schema>, overrides: Record<string, unknown> = {}) {
  return t.run(async (ctx) => {
    await ctx.db.insert('syncSubjects', {
      dataset: 'corpBlueprints' as const,
      userId: USER,
      status: 'running' as const,
      lastRequestedAt: GEN,
      workId: null,
      nextDueAt: null,
      minExpiresAt: null,
      syncedCharacterIds: [],
      lastFinishedAt: null,
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
      ...overrides,
    });
  });
}

async function seedCorpDoc(
  t: TestConvex<typeof schema>,
  blueprints: ReturnType<typeof bp>[],
  corporationId = CORP,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('corpBlueprintsSync', {
      userId: USER,
      corporationId,
      etags: ['c1'],
      lastSyncedAt: GEN - 1000,
      expiresAt: GEN - 1,
      syncError: null,
    });
    await ctx.db.insert('corpBlueprintsSyncData', {
      userId: USER,
      corporationId,
      data: { blueprints },
    });
  });
}

function readCorpDoc(t: TestConvex<typeof schema>, corporationId = CORP) {
  return t.run((ctx) =>
    ctx.db
      .query('corpBlueprintsSync')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .first(),
  );
}
function readCorpData(t: TestConvex<typeof schema>, corporationId = CORP) {
  return t.run((ctx) =>
    ctx.db
      .query('corpBlueprintsSyncData')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .first(),
  );
}
function readSubject(t: TestConvex<typeof schema>) {
  return t.run((ctx) =>
    ctx.db
      .query('syncSubjects')
      .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'corpBlueprints'))
      .unique(),
  );
}

function applyArgs(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    generation: GEN,
    enumeratedCharacterIds: [101],
    complete: true,
    resolvedCorpIds: [CORP],
    results: [
      { corporationId: CORP, blueprints: [bp()], etags: ['c1'], expiresAt: GEN + 3_600_000, error: null },
    ],
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
    ...overrides,
  };
}

describe('corpBlueprints.forViewer (cold payload)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.corpBlueprints.forViewer, {})).toBe(null);
  });

  it('groups the viewer corp blueprints by corporation', async () => {
    const t = convexTest(schema, modules);
    await seedCorpDoc(t, [bp()]);

    const view = await t.withIdentity({ subject: USER }).query(api.corpBlueprints.forViewer, {});
    expect(view?.corporations).toEqual([{ corporationId: CORP, data: { blueprints: [bp()] } }]);
  });
});

describe('corpBlueprints.runStateForViewer (hot run state)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.corpBlueprints.runStateForViewer, {})).toBe(null);
  });

  it('returns per-corp freshness and the sync state when signed in', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t, { status: 'idle', lastFinishedAt: GEN });
    await t.run(async (ctx) => {
      await ctx.db.insert('corpBlueprintsSync', {
        userId: USER,
        corporationId: CORP,
        etags: ['c1'],
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.corpBlueprints.runStateForViewer, {});
    expect(view?.corporations).toEqual([{ corporationId: CORP, lastSyncedAt: GEN, syncError: null }]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('corpBlueprints.heldState', () => {
  it('offers per-page etags only beside a stored cold payload', async () => {
    const t = convexTest(schema, modules);
    await seedCorpDoc(t, [bp()], CORP);
    await t.run(async (ctx) => {
      // A corp with a hot row but no cold doc (needs_role state) → etags withheld.
      await ctx.db.insert('corpBlueprintsSync', {
        userId: USER,
        corporationId: 3000,
        etags: ['cX'],
        lastSyncedAt: null,
        expiresAt: null,
        syncError: 'needs_role',
      });
    });

    const held = await t.run((ctx) =>
      ctx.runQuery(internal.corpBlueprints.heldState, { userId: USER }),
    );
    expect(held).toContainEqual({ corporationId: CORP, etags: ['c1'] });
    expect(held).toContainEqual({ corporationId: 3000, etags: [] });
  });
});

describe('corpBlueprints.applySyncResults', () => {
  it('writes the cold payload, hot meta, and stamps the subject', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);

    await t.mutation(internal.corpBlueprints.applySyncResults, applyArgs());

    expect((await readCorpData(t))?.data).toEqual({ blueprints: [bp()] });
    expect((await readCorpDoc(t))?.etags).toEqual(['c1']);
    expect((await readCorpDoc(t))?.expiresAt).toBe(GEN + 3_600_000);
    expect((await readSubject(t))?.minExpiresAt).toBe(GEN + 3_600_000);
  });

  it('drops a previously-synced cold board when the corp transitions to needs_role', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedCorpDoc(t, [bp()]);

    await t.mutation(
      internal.corpBlueprints.applySyncResults,
      applyArgs({
        results: [
          { corporationId: CORP, blueprints: null, etags: ['c1'], expiresAt: null, error: 'needs_role' },
        ],
      }),
    );

    expect((await readCorpDoc(t))?.syncError).toBe('needs_role');
    expect(await readCorpData(t)).toBeNull();
  });

  it('rewrites the cold doc only when the projected set changed', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedCorpDoc(t, [bp()]);

    // Identical fresh body → cold-skip path runs, value stays.
    await t.mutation(internal.corpBlueprints.applySyncResults, applyArgs());
    expect((await readCorpData(t))?.data).toEqual({ blueprints: [bp()] });

    // Changed fresh body → cold updated.
    await t.mutation(
      internal.corpBlueprints.applySyncResults,
      applyArgs({
        results: [
          {
            corporationId: CORP,
            blueprints: [bp({ material_efficiency: 8 })],
            etags: ['c2'],
            expiresAt: GEN + 3_600_000,
            error: null,
          },
        ],
      }),
    );
    expect((await readCorpData(t))?.data).toEqual({ blueprints: [bp({ material_efficiency: 8 })] });
  });

  it('orphan-cleans both halves of a corp no longer resolved (complete run)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedCorpDoc(t, [bp()], 9999); // not in resolvedCorpIds below

    await t.mutation(internal.corpBlueprints.applySyncResults, applyArgs());

    expect(await readCorpDoc(t, 9999)).toBeNull();
    expect(await readCorpData(t, 9999)).toBeNull();
    expect((await readCorpData(t, CORP))?.data).toEqual({ blueprints: [bp()] });
  });

  it('retains existing docs on an incomplete run (no orphan cleanup)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedCorpDoc(t, [bp()], 9999);

    await t.mutation(
      internal.corpBlueprints.applySyncResults,
      applyArgs({ complete: false, resolvedCorpIds: [], results: [], lastError: 'budget_exhausted:x' }),
    );

    // Nothing deleted on incomplete information.
    expect(await readCorpDoc(t, 9999)).not.toBeNull();
    expect((await readCorpData(t, 9999))?.data).toEqual({ blueprints: [bp()] });
  });

  it('no-ops when the generation token does not match the subject', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);

    await t.mutation(internal.corpBlueprints.applySyncResults, applyArgs({ generation: GEN + 999 }));

    expect(await readCorpDoc(t)).toBeNull();
    expect((await readSubject(t))?.syncedCharacterIds).toEqual([]);
  });
});
