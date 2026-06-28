// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_online_1';
const GEN = 1_700_000_000_000;
const WINDOW = GEN + 60_000;

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'onlineStatus' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 60_000,
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

function result(overrides: Record<string, unknown> = {}) {
  return {
    characterId: 101,
    online: true,
    etag: 'o1',
    expiresAt: WINDOW,
    error: null,
    ...overrides,
  };
}

function apply(
  t: TestConvex<typeof schema>,
  args: { results: ReturnType<typeof result>[]; generation?: number; enumeratedCharacterIds?: number[] },
) {
  return t.mutation(internal.onlineStatus.applySyncResults, {
    userId: USER,
    generation: args.generation ?? GEN,
    enumeratedCharacterIds: args.enumeratedCharacterIds ?? args.results.map((r) => r.characterId),
    results: args.results,
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
  });
}

function readDoc(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterOnline')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function readSubject(t: TestConvex<typeof schema>) {
  return t.run((ctx) =>
    ctx.db
      .query('syncSubjects')
      .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'onlineStatus'))
      .unique(),
  );
}

describe('onlineStatus.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.onlineStatus.forViewer, {})).toBe(null);
  });

  it('returns the viewer per-character online flags when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'a' });
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 202, online: false, etag: 'b' });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.onlineStatus.forViewer, {});
    expect(view?.characters).toEqual([
      { characterId: 101, online: true },
      { characterId: 202, online: false },
    ]);
  });
});

describe('onlineStatus.heldState', () => {
  it('returns each character etag for the conditional read', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'held1' }),
    );
    const held = await t.query(internal.onlineStatus.heldState, { userId: USER });
    expect(held).toEqual([{ characterId: 101, etag: 'held1' }]);
  });
});

describe('onlineStatus.applySyncResults', () => {
  it('inserts a fresh result and stamps the subject window + enumeration', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert('syncSubjects', subjectRow()));

    await apply(t, { results: [result()] });

    expect((await readDoc(t))?.online).toBe(true);
    const subject = await readSubject(t);
    expect(subject?.minExpiresAt).toBe(WINDOW);
    expect(subject?.syncedCharacterIds).toEqual([101]);
  });

  it('no-ops when the generation does not match the subject (a superseded run)', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert('syncSubjects', subjectRow({ lastRequestedAt: GEN })));

    await apply(t, { results: [result()], generation: GEN + 1 });

    expect(await readDoc(t)).toBeNull();
  });

  it('deletes the doc of a character no longer enumerated (orphan cleanup)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'a' });
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 999, online: true, etag: 'gone' });
    });

    await apply(t, { results: [result()], enumeratedCharacterIds: [101] });

    expect(await readDoc(t, 999)).toBeNull();
    expect(await readDoc(t, 101)).not.toBeNull();
  });

  it('keeps the last-known doc and poisons the window to stale on an errored result', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'o0' });
    });

    await apply(t, {
      results: [result({ online: null, etag: 'o0', expiresAt: null, error: 'esi_500' })],
    });

    const doc = await readDoc(t);
    expect(doc?.online).toBe(true);
    expect(doc?.etag).toBe('o0');
    // A null window poisons minCacheWindow → stale-now, so the next heartbeat re-syncs.
    expect((await readSubject(t))?.minExpiresAt).toBeNull();
  });
});
