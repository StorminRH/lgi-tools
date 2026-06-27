// Corp industry-jobs tracker (3.7.3.1, the first corp feature) — the Convex
// half of the corp-jobs sync flow, the per-corp twin of the per-character
// industry-jobs tracker (convex/industryJobs.ts). Run-lifecycle machinery is the
// 3.4.9 engine's (convex/engine.ts); the corp resolution + dedup + corp-keyed
// apply skeleton are the reusable corp machinery (convex/lib/corpSync.ts).
//
// Canonical shape: client heartbeat (engine, presence + on-view dispatch) →
// engine scan on the dataset's cadence while watched → Workpool →
// corpIndustryJobsSync.syncUser (action: resolves the user's characters to the
// corps they can read, dedups by corp, reads each corp's board ONCE) →
// applySyncResults (ONE batched mutation, generation-guarded against the
// engine's subject row) → forViewer (reactive query). No client-posted id
// carries authority — the action re-resolves server-side on every run.
//
// Live-flip note: like the per-character tracker, the corp board now schedules a
// markJobReady completion flip (3.7.3.4) so an open corp board flips a job to
// 'ready' at its end_date with no resync — the per-corp twin of
// convex/industryJobs.ts. The at-write deriveJobStatus below still rewrites an
// active-past-end job to 'ready' on every fresh read, so the projection stays
// correct and regenerable (a pure function of payload + now) even between flips.
import { v, type Infer } from 'convex/values';
import { deriveJobStatus, findFlipTarget, flipsToSchedule } from '@/features/industry-jobs/job-state';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, query } from './_generated/server';
import { applyCorpDataset } from './lib/corpSync';
import { getSyncSubject } from './lib/subjects';
import { industryJobValidator } from './schema';

// The COLD half of the viewer split (SA.5): the calling user's synced corp job
// boards, keyed by corporation. Its read set is corpIndustryJobsSyncData alone —
// so it re-fires only on a genuine board change (a fresh body or a markJobReady
// completion flip), never on a per-cycle 304/dispatch/completion. The client
// joins it with runStateForViewer by corporation id. A needs_role corp has a hot
// row but no cold doc, so it isn't here — the merge surfaces it via its hot row.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('corpIndustryJobsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      corporations: docs.map((doc) => ({ corporationId: doc.corporationId, data: doc.data })),
    };
  },
});

// The HOT half of the viewer split (SA.5): per-corp freshness/error plus the run
// lifecycle. Reads only the small hot meta docs (corpIndustryJobsSync) and the
// subject row, so it re-fires every cycle cheaply.
export const runStateForViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('corpIndustryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const state = await getSyncSubject(ctx.db, 'corpIndustryJobs', userId);
    return {
      corporations: docs.map((doc) => ({
        corporationId: doc.corporationId,
        lastSyncedAt: doc.lastSyncedAt,
        syncError: doc.syncError,
      })),
      syncState:
        state === null
          ? null
          : {
              status: state.status,
              lastRequestedAt: state.lastRequestedAt,
              lastFinishedAt: state.lastFinishedAt,
              lastError: state.lastError,
            },
    };
  },
});

// The action's read seam: which ETag to replay per corp. An ETag is only offered
// when the doc holds the payload a 304 would confirm — so a 304 can never arrive
// without data to keep.
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('corpIndustryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    // Cold-doc presence is the data-presence gate after the split (a cold doc
    // exists iff that corp holds a board), so the held etag is only offered when
    // a 304 would actually have a payload to confirm.
    const coldDocs = await ctx.db
      .query('corpIndustryJobsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const hasData = new Set(coldDocs.map((doc) => doc.corporationId));
    return docs.map((doc) => ({
      corporationId: doc.corporationId,
      jobsEtag: hasData.has(doc.corporationId) ? doc.jobsEtag : null,
    }));
  },
});

// Per-corp outcome the action hands back. `jobs` is null on a 304 (keep the
// doc's copy), an error, or a 'needs_role' corp; the etag is the RESOLVED value
// to store. Statuses arrive as raw ESI truth; the apply derives at-write.
const corpResultValidator = v.object({
  corporationId: v.number(),
  jobs: v.union(v.null(), v.array(industryJobValidator)),
  jobsEtag: v.union(v.string(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});
type CorpResult = Infer<typeof corpResultValidator>;

// The run's single batched write, delegating the corp-keyed skeleton (generation
// guard → orphan cleanup → upsert → stamp) to applyCorpDataset. Idempotent
// (upserts keyed userId+corporationId) so a Workpool retry can't double-write;
// the generation guard makes a superseded run's late apply a no-op. `complete`
// gates orphan cleanup — false when the run was cut short before the full corp
// set was known, so nothing is deleted on incomplete information.
export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    complete: v.boolean(),
    resolvedCorpIds: v.array(v.number()),
    results: v.array(corpResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const resultByCorp = new Map(args.results.map((r) => [r.corporationId, r]));
    const existingByCorp = new Map<number, Doc<'corpIndustryJobsSync'>>();
    // The cold payload docs, loaded alongside the hot meta so the upsert gets
    // each corp's existing board and orphan cleanup can delete both halves.
    const existingColdByCorp = new Map<number, Doc<'corpIndustryJobsSyncData'>>();
    const now = Date.now();

    await applyCorpDataset<Doc<'corpIndustryJobsSync'>>(ctx, {
      dataset: 'corpIndustryJobs',
      userId: args.userId,
      generation: args.generation,
      keepCorpIds: args.complete ? new Set(args.resolvedCorpIds) : null,
      upsertCorpIds: args.results.map((r) => r.corporationId),
      stamp: {
        enumeratedCharacterIds: args.enumeratedCharacterIds,
        lastError: args.lastError,
        rlGroup: args.rlGroup,
        rlLimit: args.rlLimit,
        rlRemaining: args.rlRemaining,
        rlUsed: args.rlUsed,
      },
      now,
      loadExisting: async () => {
        const docs = await ctx.db
          .query('corpIndustryJobsSync')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .collect();
        for (const doc of docs) existingByCorp.set(doc.corporationId, doc);
        const coldDocs = await ctx.db
          .query('corpIndustryJobsSyncData')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .collect();
        for (const doc of coldDocs) existingColdByCorp.set(doc.corporationId, doc);
        return docs;
      },
      corpIdOf: (doc) => doc.corporationId,
      expiresAtOf: (doc) => doc.expiresAt,
      deleteDoc: async (doc) => {
        await ctx.db.delete(doc._id);
        const cold = existingColdByCorp.get(doc.corporationId);
        if (cold !== undefined) await ctx.db.delete(cold._id);
      },
      upsertOne: (corporationId) => {
        const result = resultByCorp.get(corporationId);
        // upsertCorpIds is derived from results, so a result always exists here.
        if (result === undefined) return Promise.resolve(null);
        return upsertCorpJobs(
          ctx,
          args.userId,
          result,
          existingByCorp.get(corporationId),
          existingColdByCorp.get(corporationId),
          now,
        );
      },
    });
  },
});

// Upsert one corp's job board. A fresh body replaces the board wholesale (one
// endpoint — no merge) and derives each job's at-write status (an active job
// past its end_date lands 'ready'). A 304, an error, or a 'needs_role' corp
// keeps the existing payload; a non-refresh result clears the cache window so the
// next heartbeat re-syncs immediately. Returns the resulting cache window so the
// caller accumulates the post-apply set without re-reading the table.
async function upsertCorpJobs(
  ctx: MutationCtx,
  userId: string,
  result: CorpResult,
  existingHot: Doc<'corpIndustryJobsSync'> | undefined,
  existingCold: Doc<'corpIndustryJobsSyncData'> | undefined,
  now: number,
): Promise<number | null> {
  const refreshed = result.error === null;
  const hotFields = {
    jobsEtag: result.jobsEtag,
    lastSyncedAt: refreshed ? now : (existingHot?.lastSyncedAt ?? null),
    expiresAt: refreshed ? result.expiresAt : null,
    syncError: result.error,
  };
  if (existingHot !== undefined) {
    await ctx.db.patch(existingHot._id, hotFields);
  } else {
    await ctx.db.insert('corpIndustryJobsSync', {
      userId,
      corporationId: result.corporationId,
      ...hotFields,
    });
  }

  // Cold payload: a fresh body replaces the board wholesale and arms a completion
  // flip for each (job_id, end_date) new to the COLD doc's prior payload
  // (flipsToSchedule) — exactly as the per-character apply does; rides the
  // existing scheduler, no new timer. A 304, an error, or a needs_role corp
  // leaves the cold doc — and the payload view — untouched.
  if (result.jobs !== null) {
    const jobs = result.jobs.map((job) => ({
      ...job,
      status: deriveJobStatus(job.status, job.end_date, now),
    }));
    for (const job of flipsToSchedule(existingCold?.data?.jobs ?? null, jobs, now)) {
      await ctx.scheduler.runAt(Date.parse(job.end_date), internal.corpIndustryJobs.markJobReady, {
        userId,
        corporationId: result.corporationId,
        jobId: job.job_id,
        endDate: job.end_date,
      });
    }
    const data = { jobs };
    if (existingCold !== undefined) {
      await ctx.db.patch(existingCold._id, { data });
    } else {
      await ctx.db.insert('corpIndustryJobsSyncData', {
        userId,
        corporationId: result.corporationId,
        data,
      });
    }
  }
  return hotFields.expiresAt;
}

// The scheduled completion transition for a corp job: fires at a job's end_date
// and flips it to 'ready' so an open corp board updates live — the per-corp twin
// of convex/industryJobs.ts markJobReady (keyed by corporation instead of
// character). Identity-guarded and throw-free: every disqualifying interleaving
// (job delivered, paused, re-priced to a new end_date, already flipped, doc
// wiped) is a clean no-op decided purely on stored state (findFlipTarget), so it
// never writes when nothing genuinely transitioned (CONVEX.md Cost Rule 3).
// Deliberately NOT time-guarded (the scheduler fires at end_date by
// construction; a hair-early no-op would orphan the job 'active' forever) and
// does not touch expiresAt (freshness stays the engine's job).
export const markJobReady = internalMutation({
  args: {
    userId: v.string(),
    corporationId: v.number(),
    jobId: v.number(),
    endDate: v.string(),
  },
  handler: async (ctx, { userId, corporationId, jobId, endDate }) => {
    // .first(), not .unique(): a scheduled mutation that throws is terminal (not
    // retried), so a duplicate doc must never wedge the flip. The pair is keyed
    // unique by the apply path; flipping the first is correct either way.
    const doc = await ctx.db
      .query('corpIndustryJobsSyncData')
      .withIndex('by_user_corp', (q) => q.eq('userId', userId).eq('corporationId', corporationId))
      .first();
    if (doc === null) return;
    const index = findFlipTarget(doc.data.jobs, jobId, endDate);
    if (index === null) return;
    await ctx.db.patch(doc._id, {
      data: {
        jobs: doc.data.jobs.map((job, i) =>
          i === index ? { ...job, status: 'ready' as const } : job,
        ),
      },
    });
  },
});
