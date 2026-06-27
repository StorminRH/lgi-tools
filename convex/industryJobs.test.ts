// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_jobs_1';
const GEN = 1_700_000_000_000;
const PAST = '2020-01-01T00:00:00Z';
const FUTURE = '2099-01-01T00:00:00Z';

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'industryJobs' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 300_000,
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

function job(overrides: Record<string, unknown> = {}) {
  return {
    job_id: 5,
    activity_id: 1,
    blueprint_type_id: 1000,
    runs: 1,
    status: 'active' as const,
    start_date: PAST,
    end_date: FUTURE,
    ...overrides,
  };
}

// Read one character's HOT meta doc and COLD payload doc (SA.5 split).
function readDocs(t: TestConvex<typeof schema>, characterId: number) {
  return t.run(async (ctx) => ({
    hot: await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
    cold: await ctx.db
      .query('industryJobsSyncData')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  }));
}

describe('industryJobs.forViewer (cold payload)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.industryJobs.forViewer, {})).toBe(null);
  });

  it('returns the viewer job boards when signed in', async () => {
    const t = convexTest(schema, modules);
    const j = job();
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSyncData', {
        userId: USER,
        characterId: 101,
        data: { jobs: [j] },
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.industryJobs.forViewer, {});
    expect(view?.characters).toEqual([{ characterId: 101, data: { jobs: [j] } }]);
  });
});

describe('industryJobs.runStateForViewer (hot run state)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.industryJobs.runStateForViewer, {})).toBe(null);
  });

  it('returns per-character freshness and the sync state when signed in', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ status: 'idle', lastFinishedAt: GEN }));
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        jobsEtag: 'j1',
        lastSyncedAt: GEN,
        expiresAt: GEN + 300_000,
        syncError: null,
      });
    });

    const view = await t
      .withIdentity({ subject: USER })
      .query(api.industryJobs.runStateForViewer, {});
    expect(view?.characters).toEqual([{ characterId: 101, lastSyncedAt: GEN, syncError: null }]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('industryJobs.heldState', () => {
  it('offers an etag only beside a stored cold payload', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        jobsEtag: 'j1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('industryJobsSyncData', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job()] },
      });
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 202,
        jobsEtag: 'jX',
        lastSyncedAt: null,
        expiresAt: null,
        syncError: 'esi_500',
      });
    });

    const held = await t.run((ctx) =>
      ctx.runQuery(internal.industryJobs.heldState, { userId: USER }),
    );
    expect(held).toEqual([
      { characterId: 101, jobsEtag: 'j1' },
      { characterId: 202, jobsEtag: null },
    ]);
  });
});

describe('industryJobs.applySyncResults', () => {
  it('derives ready for a past-due job and keeps a future job active', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
    });

    await t.mutation(internal.industryJobs.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        {
          characterId: 101,
          jobs: [job({ job_id: 1, end_date: PAST }), job({ job_id: 2, end_date: FUTURE })],
          jobsEtag: 'j1',
          expiresAt: GEN + 300_000,
          error: null,
        },
      ],
      lastError: null,
      rlGroup: 'char-industry',
      rlLimit: 600,
      rlRemaining: 599,
      rlUsed: 1,
    });

    const { hot, cold } = await readDocs(t, 101);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
        .unique(),
    );

    const byId = Object.fromEntries((cold?.data?.jobs ?? []).map((j) => [j.job_id, j.status]));
    expect(byId).toEqual({ 1: 'ready', 2: 'active' });
    expect(hot?.jobsEtag).toBe('j1');
    expect(hot?.expiresAt).toBe(GEN + 300_000);
    expect(subject?.minExpiresAt).toBe(GEN + 300_000);
    expect(subject?.syncedCharacterIds).toEqual([101]);
    expect(subject?.rlGroup).toBe('char-industry');
  });

  // The SA.5 structural proof: a 304 touches only the hot meta doc.
  it('leaves the cold board untouched on a 304 while bumping the hot meta', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        jobsEtag: 'j0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
      await ctx.db.insert('industryJobsSyncData', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 7 })] },
      });
    });
    const { cold: coldBefore } = await readDocs(t, 101);

    await t.mutation(internal.industryJobs.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [{ characterId: 101, jobs: null, jobsEtag: 'j0', expiresAt: GEN + 300_000, error: null }],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { hot, cold } = await readDocs(t, 101);
    // Byte-identical (incl. _id / _creationTime): the cold board view never re-fires on a 304.
    expect(cold).toEqual(coldBefore);
    expect(hot?.expiresAt).toBe(GEN + 300_000);
    expect((hot?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  it('keeps the cold board and clears the hot window on an errored read', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        jobsEtag: 'j0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN + 5000,
        syncError: null,
      });
      await ctx.db.insert('industryJobsSyncData', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 7 })] },
      });
    });

    await t.mutation(internal.industryJobs.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [{ characterId: 101, jobs: null, jobsEtag: 'j0', expiresAt: null, error: 'esi_500' }],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { hot, cold } = await readDocs(t, 101);
    expect(cold?.data?.jobs.map((j) => j.job_id)).toEqual([7]);
    expect(hot?.lastSyncedAt).toBe(GEN - 1000);
    expect(hot?.expiresAt).toBeNull();
    expect(hot?.syncError).toBe('esi_500');
  });

  it('deletes both the hot and cold docs for a character no longer enumerated', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      for (const characterId of [101, 999]) {
        await ctx.db.insert('industryJobsSync', {
          userId: USER,
          characterId,
          jobsEtag: 'j',
          lastSyncedAt: GEN,
          expiresAt: GEN,
          syncError: null,
        });
        await ctx.db.insert('industryJobsSyncData', {
          userId: USER,
          characterId,
          data: { jobs: [job()] },
        });
      }
    });

    await t.mutation(internal.industryJobs.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        { characterId: 101, jobs: [job()], jobsEtag: 'j1', expiresAt: GEN + 300_000, error: null },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const { hotIds, coldIds } = await t.run(async (ctx) => ({
      hotIds: (await ctx.db.query('industryJobsSync').collect()).map((d) => d.characterId).sort(),
      coldIds: (await ctx.db.query('industryJobsSyncData').collect()).map((d) => d.characterId).sort(),
    }));
    expect(hotIds).toEqual([101]);
    expect(coldIds).toEqual([101]);
  });
});

describe('industryJobs.markJobReady', () => {
  it('flips the identity-matched active job to ready', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSyncData', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 5, end_date: FUTURE })] },
      });
    });

    await t.mutation(internal.industryJobs.markJobReady, {
      userId: USER,
      characterId: 101,
      jobId: 5,
      endDate: FUTURE,
    });

    const { cold } = await readDocs(t, 101);
    expect(cold?.data?.jobs[0]?.status).toBe('ready');
  });

  it('no-ops when the end_date no longer matches', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSyncData', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 5, end_date: FUTURE })] },
      });
    });

    await t.mutation(internal.industryJobs.markJobReady, {
      userId: USER,
      characterId: 101,
      jobId: 5,
      endDate: PAST,
    });

    const { cold } = await readDocs(t, 101);
    expect(cold?.data?.jobs[0]?.status).toBe('active');
  });

  it('no-ops when the character doc is gone', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.industryJobs.markJobReady, {
        userId: USER,
        characterId: 404,
        jobId: 5,
        endDate: FUTURE,
      }),
    ).resolves.toBeNull();
  });
});
