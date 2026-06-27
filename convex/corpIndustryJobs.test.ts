// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

// The corp dataset's query + scheduled live-flip (3.7.3.4). The sync action is
// covered separately (corpIndustryJobsSync.test.ts); this file covers forViewer
// (the client seam) and markJobReady (the per-corp twin of the per-character
// flip), including the genuine-transition-only no-ops that keep it free of
// no-op writes (CONVEX.md Cost Rule 3).
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_corp_jobs_1';
const CORP = 2000;
const GEN = 1_700_000_000_000;
const PAST = '2020-01-01T00:00:00Z';
const FUTURE = '2099-01-01T00:00:00Z';

function corpJob(overrides: Record<string, unknown> = {}) {
  return {
    job_id: 5,
    installer_id: 90001,
    activity_id: 1,
    blueprint_type_id: 1000,
    runs: 1,
    status: 'active' as const,
    start_date: PAST,
    end_date: FUTURE,
    ...overrides,
  };
}

async function seedCorpDoc(
  t: TestConvex<typeof schema>,
  jobs: ReturnType<typeof corpJob>[],
  corporationId = CORP,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('corpIndustryJobsSync', {
      userId: USER,
      corporationId,
      data: { jobs },
      jobsEtag: 'cj1',
      lastSyncedAt: GEN,
      expiresAt: GEN,
      syncError: null,
    });
  });
}

function readCorpDoc(t: TestConvex<typeof schema>, corporationId = CORP) {
  return t.run((ctx) =>
    ctx.db
      .query('corpIndustryJobsSync')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .first(),
  );
}

describe('corpIndustryJobs.forViewer', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.corpIndustryJobs.forViewer, {})).toBe(null);
  });

  it('groups the viewer corp boards by corporation with sync state', async () => {
    const t = convexTest(schema, modules);
    const j = corpJob();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', {
        dataset: 'corpIndustryJobs' as const,
        userId: USER,
        status: 'idle' as const,
        lastRequestedAt: GEN,
        workId: null,
        nextDueAt: null,
        minExpiresAt: null,
        syncedCharacterIds: [],
        lastFinishedAt: GEN,
        lastError: null,
        rlGroup: null,
        rlLimit: null,
        rlRemaining: null,
        rlUsed: null,
      });
    });
    await seedCorpDoc(t, [j]);

    const view = await t.withIdentity({ subject: USER }).query(api.corpIndustryJobs.forViewer, {});
    expect(view?.corporations).toEqual([
      { corporationId: CORP, data: { jobs: [j] }, lastSyncedAt: GEN, syncError: null },
    ]);
    expect(view?.syncState).toEqual({
      status: 'idle',
      lastRequestedAt: GEN,
      lastFinishedAt: GEN,
      lastError: null,
    });
  });
});

describe('corpIndustryJobs.markJobReady', () => {
  it('flips the identity-matched active corp job to ready', async () => {
    const t = convexTest(schema, modules);
    await seedCorpDoc(t, [corpJob({ job_id: 5, end_date: FUTURE })]);

    await t.mutation(internal.corpIndustryJobs.markJobReady, {
      userId: USER,
      corporationId: CORP,
      jobId: 5,
      endDate: FUTURE,
    });

    const doc = await readCorpDoc(t);
    expect(doc?.data?.jobs[0]?.status).toBe('ready');
  });

  it('no-ops when the end_date no longer matches (re-priced job)', async () => {
    const t = convexTest(schema, modules);
    await seedCorpDoc(t, [corpJob({ job_id: 5, end_date: FUTURE })]);

    await t.mutation(internal.corpIndustryJobs.markJobReady, {
      userId: USER,
      corporationId: CORP,
      jobId: 5,
      endDate: PAST,
    });

    const doc = await readCorpDoc(t);
    expect(doc?.data?.jobs[0]?.status).toBe('active');
  });

  it('no-ops when the job is already ready (no double-write)', async () => {
    const t = convexTest(schema, modules);
    await seedCorpDoc(t, [corpJob({ job_id: 5, end_date: FUTURE, status: 'ready' as const })]);

    await t.mutation(internal.corpIndustryJobs.markJobReady, {
      userId: USER,
      corporationId: CORP,
      jobId: 5,
      endDate: FUTURE,
    });

    const doc = await readCorpDoc(t);
    expect(doc?.data?.jobs[0]?.status).toBe('ready');
  });

  it('flips only the targeted corp, leaving another corp untouched', async () => {
    const t = convexTest(schema, modules);
    await seedCorpDoc(t, [corpJob({ job_id: 5, end_date: FUTURE })], CORP);
    await seedCorpDoc(t, [corpJob({ job_id: 5, end_date: FUTURE })], 4000);

    await t.mutation(internal.corpIndustryJobs.markJobReady, {
      userId: USER,
      corporationId: CORP,
      jobId: 5,
      endDate: FUTURE,
    });

    expect((await readCorpDoc(t, CORP))?.data?.jobs[0]?.status).toBe('ready');
    expect((await readCorpDoc(t, 4000))?.data?.jobs[0]?.status).toBe('active');
  });

  it('no-ops when the corp doc is gone', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.corpIndustryJobs.markJobReady, {
        userId: USER,
        corporationId: 9999,
        jobId: 5,
        endDate: FUTURE,
      }),
    ).resolves.toBeNull();
  });
});
