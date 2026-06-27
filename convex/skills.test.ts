// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
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

// Read one character's HOT meta doc and COLD payload doc (SA.5 split).
function readDocs(t: TestConvex<typeof schema>, characterId: number) {
  return t.run(async (ctx) => ({
    hot: await ctx.db
      .query('characterSync')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
    cold: await ctx.db
      .query('characterSyncData')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  }));
}

describe('skills.forViewer (cold payload)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.skills.forViewer, {})).toBe(null);
  });

  it('returns the viewer characters payload when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterSyncData', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 1000 },
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.skills.forViewer, {});
    expect(view?.characters).toEqual([
      { characterId: 101, data: { entries: [entry], totalSp: 1000 } },
    ]);
  });
});

describe('skills.runStateForViewer (hot run state)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.skills.runStateForViewer, {})).toBe(null);
  });

  it('returns per-character freshness and the sync state when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ status: 'idle', lastFinishedAt: GEN }));
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        queueEtag: 'q1',
        skillsEtag: 's1',
        lastSyncedAt: GEN,
        expiresAt: GEN + 60_000,
        syncError: null,
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.skills.runStateForViewer, {});
    expect(view?.characters).toEqual([{ characterId: 101, lastSyncedAt: GEN, syncError: null }]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('skills.heldState', () => {
  it('offers an etag only beside a stored cold payload', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // char 101: hot etags AND a cold payload doc → etags offered.
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        queueEtag: 'q1',
        skillsEtag: 's1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('characterSyncData', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 1000 },
      });
      // char 202: hot etags but NO cold doc (errored first read) → etags withheld,
      // so a 304 can never arrive with no payload to keep.
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 202,
        queueEtag: 'qX',
        skillsEtag: 'sX',
        lastSyncedAt: null,
        expiresAt: null,
        syncError: 'esi_500',
      });
    });

    const held = await t.run((ctx) => ctx.runQuery(internal.skills.heldState, { userId: USER }));
    expect(held).toEqual([
      { characterId: 101, queueEtag: 'q1', skillsEtag: 's1' },
      { characterId: 202, queueEtag: null, skillsEtag: null },
    ]);
  });
});

describe('skills.applySyncResults', () => {
  it('writes the payload to the cold doc, meta to the hot doc, and stamps the subject', async () => {
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

    const { hot, cold } = await readDocs(t, 101);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
        .unique(),
    );

    expect(cold?.data).toEqual({ entries: [entry], totalSp: 1000 });
    expect(hot?.queueEtag).toBe('q1');
    expect(hot?.skillsEtag).toBe('s1');
    expect(hot?.expiresAt).toBe(GEN + 60_000);
    expect(hot?.syncError).toBeNull();
    expect(typeof hot?.lastSyncedAt).toBe('number');

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

    const { hot, cold, subject } = await t.run(async (ctx) => ({
      hot: await ctx.db.query('characterSync').collect(),
      cold: await ctx.db.query('characterSyncData').collect(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
        .unique(),
    }));
    expect(hot).toHaveLength(0);
    expect(cold).toHaveLength(0);
    expect(subject?.syncedCharacterIds).toEqual([]);
  });

  // The SA.5 structural proof: a 304 must touch ONLY the hot meta doc, leaving the
  // cold payload doc byte-identical — so the cold payload view's read set never
  // re-fires for an unchanged blob.
  it('leaves the cold payload doc untouched on a 304 while bumping the hot meta', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        queueEtag: 'q0',
        skillsEtag: 's0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
      await ctx.db.insert('characterSyncData', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 500 },
      });
    });
    const { cold: coldBefore } = await readDocs(t, 101);

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

    const { hot, cold } = await readDocs(t, 101);
    // Byte-identical including _id and _creationTime — proves no write (and no
    // delete+insert masquerading as one) reached the cold table on a 304.
    expect(cold).toEqual(coldBefore);
    // The hot meta moved: fresh cache window + a bumped "as of".
    expect(hot?.expiresAt).toBe(GEN + 60_000);
    expect((hot?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  // B1: skills has two independent halves, so a mixed 200/304 (queue fresh, skills
  // unchanged) IS a data change and MUST reach the cold doc.
  it('writes the cold doc on a mixed 200/304 (queue fresh, skills unchanged)', async () => {
    const t = convexTest(schema, modules);
    const newEntry = { skill_id: 2, queue_position: 0, finished_level: 3 };
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        queueEtag: 'q0',
        skillsEtag: 's0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
      await ctx.db.insert('characterSyncData', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 500 },
      });
    });

    await t.mutation(internal.skills.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          queueEntries: [newEntry],
          skills: null,
          queueEtag: 'q1',
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

    const { cold } = await readDocs(t, 101);
    // mergeData keeps the 304 skills half (totalSp 500), replaces the fresh queue.
    expect(cold?.data).toEqual({ entries: [newEntry], totalSp: 500 });
  });

  it('keeps the cold payload but clears the hot window on an errored read', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        queueEtag: 'q0',
        skillsEtag: 's0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN + 5000,
        syncError: null,
      });
      await ctx.db.insert('characterSyncData', {
        userId: USER,
        characterId: 101,
        data: { entries: [entry], totalSp: 500 },
      });
    });
    const { cold: coldBefore } = await readDocs(t, 101);

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

    const { hot, cold } = await readDocs(t, 101);
    expect(cold).toEqual(coldBefore);
    expect(hot?.lastSyncedAt).toBe(GEN - 1000);
    expect(hot?.expiresAt).toBeNull();
    expect(hot?.syncError).toBe('esi_500');
  });

  it('deletes both the hot and cold docs for a character no longer enumerated', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      for (const characterId of [101, 999]) {
        await ctx.db.insert('characterSync', {
          userId: USER,
          characterId,
          queueEtag: 'q',
          skillsEtag: 's',
          lastSyncedAt: GEN,
          expiresAt: GEN,
          syncError: null,
        });
        await ctx.db.insert('characterSyncData', {
          userId: USER,
          characterId,
          data: { entries: [entry], totalSp: 1 },
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

    const { hotIds, coldIds } = await t.run(async (ctx) => ({
      hotIds: (await ctx.db.query('characterSync').collect()).map((d) => d.characterId).sort(),
      coldIds: (await ctx.db.query('characterSyncData').collect()).map((d) => d.characterId).sort(),
    }));
    expect(hotIds).toEqual([101]);
    expect(coldIds).toEqual([101]);
  });
});
