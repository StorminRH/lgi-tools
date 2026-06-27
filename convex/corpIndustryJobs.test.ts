// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

// The corp dataset's queries + scheduled live-flip (3.7.3.4). The sync action is
// covered separately (corpIndustryJobsSync.test.ts); this file covers forViewer /
// runStateForViewer (the SA.5 cold/hot client seams) and markJobReady (the
// per-corp twin of the per-character flip, now patching the COLD payload doc),
// including the genuine-transition-only no-ops that keep it free of no-op writes
// (CONVEX.md Cost Rule 3).
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

// Seed one corp's HOT meta doc + COLD payload doc (SA.5 split).
async function seedCorpDoc(
  t: TestConvex<typeof schema>,
  jobs: ReturnType<typeof corpJob>[],
  corporationId = CORP,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('corpIndustryJobsSync', {
      userId: USER,
      corporationId,
      jobsEtag: 'cj1',
      lastSyncedAt: GEN,
      expiresAt: GEN,
      syncError: null,
    });
    await ctx.db.insert('corpIndustryJobsSyncData', { userId: USER, corporationId, data: { jobs } });
  });
}

// The HOT meta doc (etag / freshness / error).
function readCorpDoc(t: TestConvex<typeof schema>, corporationId = CORP) {
  return t.run((ctx) =>
    ctx.db
      .query('corpIndustryJobsSync')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .first(),
  );
}

// The COLD payload doc (SA.5 split).
function readCorpData(t: TestConvex<typeof schema>, corporationId = CORP) {
  return t.run((ctx) =>
    ctx.db
      .query('corpIndustryJobsSyncData')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .first(),
  );
}

function seedSubject(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    await ctx.db.insert('syncSubjects', {
      dataset: 'corpIndustryJobs' as const,
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
    });
  });
}

function readSubject(t: TestConvex<typeof schema>) {
  return t.run((ctx) =>
    ctx.db
      .query('syncSubjects')
      .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'corpIndustryJobs'))
      .unique(),
  );
}

describe('corpIndustryJobs.forViewer (cold payload)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.corpIndustryJobs.forViewer, {})).toBe(null);
  });

  it('groups the viewer corp boards by corporation', async () => {
    const t = convexTest(schema, modules);
    const j = corpJob();
    await seedCorpDoc(t, [j]);

    const view = await t.withIdentity({ subject: USER }).query(api.corpIndustryJobs.forViewer, {});
    expect(view?.corporations).toEqual([{ corporationId: CORP, data: { jobs: [j] } }]);
  });
});

describe('corpIndustryJobs.runStateForViewer (hot run state)', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.corpIndustryJobs.runStateForViewer, {})).toBe(null);
  });

  it('returns per-corp freshness and the sync state when signed in', async () => {
    const t = convexTest(schema, modules);
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
      await ctx.db.insert('corpIndustryJobsSync', {
        userId: USER,
        corporationId: CORP,
        jobsEtag: 'cj1',
        lastSyncedAt: GEN,
        expiresAt: GEN,
        syncError: null,
      });
    });

    const view = await t
      .withIdentity({ subject: USER })
      .query(api.corpIndustryJobs.runStateForViewer, {});
    expect(view?.corporations).toEqual([{ corporationId: CORP, lastSyncedAt: GEN, syncError: null }]);
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

    expect((await readCorpData(t))?.data?.jobs[0]?.status).toBe('ready');
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

    expect((await readCorpData(t))?.data?.jobs[0]?.status).toBe('active');
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

    expect((await readCorpData(t))?.data?.jobs[0]?.status).toBe('ready');
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

    expect((await readCorpData(t, CORP))?.data?.jobs[0]?.status).toBe('ready');
    expect((await readCorpData(t, 4000))?.data?.jobs[0]?.status).toBe('active');
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

describe('corpIndustryJobs.applySyncResults', () => {
  // Guards the read-loop budget-stop edge (Greptile #168): resolution finished
  // (complete=true), the corp-jobs read loop read corp A fresh, hit budget
  // exhaustion on corp B, and never reached corp C. The stopped corp B carries a
  // null cache window, so minCacheWindow returns null for the whole subject —
  // the subject stays DUE-NOW and the engine re-dispatches, re-reading the
  // unread corp C. It is NOT left "fresh until C's old window expires".
  it('keeps the subject due (minExpiresAt null) after a read-loop budget stop, retaining unread corps', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    // Corp C: resolved but never read (after the stop). Pre-existing hot + cold
    // docs with a still-future window — the corp whose freshness the finding
    // worried about.
    const cWindow = GEN + 1_000_000;
    await t.run(async (ctx) => {
      await ctx.db.insert('corpIndustryJobsSync', {
        userId: USER,
        corporationId: 3000,
        jobsEtag: 'c',
        lastSyncedAt: GEN - 1000,
        expiresAt: cWindow,
        syncError: null,
      });
      await ctx.db.insert('corpIndustryJobsSyncData', {
        userId: USER,
        corporationId: 3000,
        data: { jobs: [corpJob({ job_id: 9 })] },
      });
    });

    await t.mutation(internal.corpIndustryJobs.applySyncResults, {
      userId: USER,
      generation: GEN,
      enumeratedCharacterIds: [101, 102, 103],
      complete: true,
      resolvedCorpIds: [2000, 2500, 3000], // A read, B budget-stopped, C unread
      results: [
        {
          corporationId: 2000,
          jobs: [corpJob({ job_id: 1 })],
          jobsEtag: 'a',
          expiresAt: GEN + 300_000,
          error: null,
        },
        // The budget-stopped corp: errored, null window (corpErrorResult shape).
        { corporationId: 2500, jobs: null, jobsEtag: null, expiresAt: null, error: 'budget_exhausted' },
      ],
      lastError: 'budget_exhausted:scoreboard',
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });

    // The null window from the stopped corp forces the subject due-now.
    const subject = await readSubject(t);
    expect(subject?.minExpiresAt).toBeNull();
    // Corp C is retained (complete=true keeps the full resolved set), unmodified:
    // its cold board survives and its hot window is unchanged.
    expect((await readCorpData(t, 3000))?.data?.jobs.map((j) => j.job_id)).toEqual([9]);
    expect((await readCorpDoc(t, 3000))?.expiresAt).toBe(cWindow);
  });
});
