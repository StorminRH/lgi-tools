// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
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

describe('industryJobs.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.industryJobs.forViewer, {})).toBe(null);
  });

  it('returns the viewer job boards and sync state when signed in', async () => {
    const t = convexTest(schema, modules);
    const j = job();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ status: 'idle', lastFinishedAt: GEN }));
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        data: { jobs: [j] },
        jobsEtag: 'j1',
        lastSyncedAt: GEN,
        expiresAt: GEN + 300_000,
        syncError: null,
      });
    });

    const view = await t.withIdentity({ subject: USER }).query(api.industryJobs.forViewer, {});
    expect(view?.characters).toEqual([
      { characterId: 101, data: { jobs: [j] }, lastSyncedAt: GEN, syncError: null },
    ]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('industryJobs.heldState', () => {
  it('offers an etag only beside stored data', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job()] },
        jobsEtag: 'j1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 202,
        data: null,
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

    const { doc, subject } = await t.run(async (ctx) => ({
      doc: await ctx.db
        .query('industryJobsSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
        .unique(),
    }));

    const byId = Object.fromEntries((doc?.data?.jobs ?? []).map((j) => [j.job_id, j.status]));
    expect(byId).toEqual({ 1: 'ready', 2: 'active' });
    expect(doc?.jobsEtag).toBe('j1');
    expect(doc?.expiresAt).toBe(GEN + 300_000);
    expect(subject?.minExpiresAt).toBe(GEN + 300_000);
    expect(subject?.syncedCharacterIds).toEqual([101]);
    expect(subject?.rlGroup).toBe('char-industry');
  });

  it('keeps the board and clears freshness on an errored read', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 7 })] },
        jobsEtag: 'j0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN + 5000,
        syncError: null,
      });
    });

    await t.mutation(internal.industryJobs.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101],
      results: [
        { characterId: 101, jobs: null, jobsEtag: 'j0', expiresAt: null, error: 'esi_500' },
      ],
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    const doc = await t.run((ctx) =>
      ctx.db
        .query('industryJobsSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
    );
    expect(doc?.data?.jobs.map((j) => j.job_id)).toEqual([7]);
    expect(doc?.lastSyncedAt).toBe(GEN - 1000);
    expect(doc?.expiresAt).toBeNull();
    expect(doc?.syncError).toBe('esi_500');
  });

  it('deletes a character no longer enumerated for the user', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow());
      for (const characterId of [101, 999]) {
        await ctx.db.insert('industryJobsSync', {
          userId: USER,
          characterId,
          data: { jobs: [job()] },
          jobsEtag: 'j',
          lastSyncedAt: GEN,
          expiresAt: GEN,
          syncError: null,
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

    const ids = await t.run(async (ctx) =>
      (await ctx.db.query('industryJobsSync').collect()).map((d) => d.characterId).sort(),
    );
    expect(ids).toEqual([101]);
  });
});

describe('industryJobs.markJobReady', () => {
  it('flips the identity-matched active job to ready', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 5, end_date: FUTURE })] },
        jobsEtag: 'j1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
    });

    await t.mutation(internal.industryJobs.markJobReady, {
      userId: USER,
      characterId: 101,
      jobId: 5,
      endDate: FUTURE,
    });

    const doc = await t.run((ctx) =>
      ctx.db
        .query('industryJobsSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
    );
    expect(doc?.data?.jobs[0]?.status).toBe('ready');
  });

  it('no-ops when the end_date no longer matches', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        data: { jobs: [job({ job_id: 5, end_date: FUTURE })] },
        jobsEtag: 'j1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
    });

    await t.mutation(internal.industryJobs.markJobReady, {
      userId: USER,
      characterId: 101,
      jobId: 5,
      endDate: PAST,
    });

    const doc = await t.run((ctx) =>
      ctx.db
        .query('industryJobsSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
    );
    expect(doc?.data?.jobs[0]?.status).toBe('active');
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
