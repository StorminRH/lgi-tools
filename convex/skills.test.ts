// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

// Convex bundles exclude test files, so the module map the harness loads must too.
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_skills_1';
const GEN = 1_700_000_000_000;

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'skills' as const,
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

const entry = { skill_id: 1, queue_position: 0, finished_level: 5 };

describe('skills.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.skills.forViewer, {})).toBe(null);
  });

  it('returns the viewer characters and sync state when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ status: 'idle', lastFinishedAt: GEN }));
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 1000 },
        queueEtag: 'q1',
        skillsEtag: 's1',
        lastSyncedAt: GEN,
        expiresAt: GEN + 60_000,
        syncError: null,
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.skills.forViewer, {});
    expect(view).not.toBeNull();
    expect(view?.characters).toEqual([
      { characterId: 101, data: { entries: [entry], totalSp: 1000 }, lastSyncedAt: GEN, syncError: null },
    ]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('skills.heldState', () => {
  it('offers an etag only beside stored data', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 1000 },
        queueEtag: 'q1',
        skillsEtag: 's1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 202,
        data: null,
        queueEtag: 'qX',
        skillsEtag: 'sX',
        lastSyncedAt: null,
        expiresAt: null,
        syncError: 'esi_500',
      });
    });

    const held = await t.run((ctx) =>
      ctx.runQuery(internal.skills.heldState, { userId: USER }),
    );
    expect(held).toEqual([
      { characterId: 101, queueEtag: 'q1', skillsEtag: 's1' },
      { characterId: 202, queueEtag: null, skillsEtag: null },
    ]);
  });
});

describe('skills.applySyncResults', () => {
  it('writes a fresh character payload and stamps the subject', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
    });

    await t.mutation(internal.skills.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          queueEntries: [entry],
          skills: { totalSp: 1000 },
          queueEtag: 'q1',
          skillsEtag: 's1',
          expiresAt: GEN + 60_000,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: 'char-detail',
      rlLimit: 600,
      rlRemaining: 599,
      rlUsed: 1,
    });

    const { doc, subject } = await t.run(async (ctx) => ({
      doc: await ctx.db
        .query('characterSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
        .unique(),
    }));

    expect(doc?.data).toEqual({ entries: [entry], totalSp: 1000 });
    expect(doc?.queueEtag).toBe('q1');
    expect(doc?.skillsEtag).toBe('s1');
    expect(doc?.expiresAt).toBe(GEN + 60_000);
    expect(doc?.syncError).toBeNull();
    expect(typeof doc?.lastSyncedAt).toBe('number');

    expect(subject?.minExpiresAt).toBe(GEN + 60_000);
    expect(subject?.syncedCharacterIds).toEqual([101]);
    expect(subject?.rlGroup).toBe('char-detail');
    expect(subject?.rlUsed).toBe(1);
    expect(typeof subject?.lastFinishedAt).toBe('number');
    // The workpool onComplete owns the status transition — the apply leaves it.
    expect(subject?.status).toBe('running');
  });

  it('no-ops when the generation token does not match the subject', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ lastRequestedAt: GEN }));
    });

    await t.mutation(internal.skills.applySyncResults, {
      userId: USER,
      generation: GEN + 999,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          queueEntries: [entry],
          skills: { totalSp: 1000 },
          queueEtag: 'q1',
          skillsEtag: 's1',
          expiresAt: GEN + 60_000,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { docs, subject } = await t.run(async (ctx) => ({
      docs: await ctx.db.query('characterSync').collect(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
        .unique(),
    }));
    expect(docs).toHaveLength(0);
    expect(subject?.syncedCharacterIds).toEqual([]);
  });

  it('keeps the existing payload and bumps freshness on a 304', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 500 },
        queueEtag: 'q0',
        skillsEtag: 's0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
    });

    await t.mutation(internal.skills.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          queueEntries: null,
          skills: null,
          queueEtag: 'q0',
          skillsEtag: 's0',
          expiresAt: GEN + 60_000,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const doc = await t.run((ctx) =>
      ctx.db
        .query('characterSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
    );
    expect(doc?.data).toEqual({ entries: [entry], totalSp: 500 });
    expect(doc?.expiresAt).toBe(GEN + 60_000);
    expect((doc?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  it('keeps the payload but clears freshness on an errored read', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 500 },
        queueEtag: 'q0',
        skillsEtag: 's0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN + 5000,
        syncError: null,
      });
    });

    await t.mutation(internal.skills.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          queueEntries: null,
          skills: null,
          queueEtag: 'q0',
          skillsEtag: 's0',
          expiresAt: null,
          error: 'esi_500',
        },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const doc = await t.run((ctx) =>
      ctx.db
        .query('characterSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
    );
    expect(doc?.data).toEqual({ entries: [entry], totalSp: 500 });
    expect(doc?.lastSyncedAt).toBe(GEN - 1000);
    expect(doc?.expiresAt).toBeNull();
    expect(doc?.syncError).toBe('esi_500');
  });

  it('deletes a character no longer enumerated for the user', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      for (const characterId of [101, 999]) {
        await ctx.db.insert('characterSync', {
          userId: USER,
          characterId,
          data: { entries: [entry], totalSp: 1 },
          queueEtag: 'q',
          skillsEtag: 's',
          lastSyncedAt: GEN,
          expiresAt: GEN,
          syncError: null,
        });
      }
    });

    await t.mutation(internal.skills.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          queueEntries: [entry],
          skills: { totalSp: 1000 },
          queueEtag: 'q1',
          skillsEtag: 's1',
          expiresAt: GEN + 60_000,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const ids = await t.run(async (ctx) =>
      (await ctx.db.query('characterSync').collect()).map((d) => d.characterId).sort(),
    );
    expect(ids).toEqual([101]);
  });
});
