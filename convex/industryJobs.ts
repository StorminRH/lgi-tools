// Industry-jobs tracker — the Convex half of the 3.4.8 sync flow, mirroring
// the 3.4.7 skills tracker (convex/skills.ts) by design; run-lifecycle
// machinery absorbed by the 3.4.9 engine (convex/engine.ts).
//
// Canonical shape: client heartbeat (engine, presence + on-view dispatch) →
// engine scan on the dataset's cadence while watched → Workpool →
// industryJobsSync.syncUser (action, talks to Neon + ESI) → applySyncResults
// (ONE batched mutation, generation-guarded against the engine's subject
// row) → forViewer (reactive query). The client never calls the action
// directly, and no client-posted character id carries authority — the action
// re-enumerates the user's characters server-side on every run.
//
// This tracker's own machinery: the scheduled completion transition.
// applySyncResults derives 'ready' for any job whose end_date already passed
// and schedules a markJobReady mutation at end_date for still-running jobs —
// so an open page sees the flip the moment the job completes, with no
// polling. The flip is identity-guarded (job_id + verbatim end_date) and
// idempotent; since 3.4.9 the arming is content-deduped (flipsToSchedule):
// a job's flip is scheduled when its (job_id, end_date) first appears, not
// on every fresh body — the #96 resolution.
import { v } from 'convex/values';
import { deriveJobStatus, findFlipTarget, flipsToSchedule } from '@/features/industry-jobs/job-state';
import { minCacheWindow } from '@/lib/sync-engine';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, query } from './_generated/server';
import { getSyncSubject } from './lib/subjects';
import { industryJobValidator } from './schema';

// The calling user's synced job boards + run state, grouped client-side by
// character. ETags and userId are custody/keying details — not on the wire.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const state = await getSyncSubject(ctx.db, 'industryJobs', userId);
    return {
      characters: docs.map((doc) => ({
        characterId: doc.characterId,
        data: doc.data,
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

// The action's read seam: which ETag to replay per character. An ETag is only
// offered when the doc holds the payload a 304 would confirm — so a 304 can
// never arrive without data to keep.
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return docs.map((doc) => ({
      characterId: doc.characterId,
      jobsEtag: doc.data !== null ? doc.jobsEtag : null,
    }));
  },
});

// Per-character outcome the action hands back. `jobs` is null when a 304
// said "unchanged" (keep the doc's copy); the etag is the RESOLVED value to
// store — the action echoes the held etag across a 304 because ESI's 304
// does not repeat the ETag header. Statuses arrive as raw ESI truth; the
// apply below derives.
const characterResultValidator = v.object({
  characterId: v.number(),
  jobs: v.union(v.null(), v.array(industryJobValidator)),
  jobsEtag: v.union(v.string(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

// The run's single batched write. Idempotent (upserts keyed by
// userId+characterId), so a Workpool retry that re-runs the action cannot
// double-write; the generation guard (against the engine's subject row)
// makes a superseded run's late apply a no-op instead of an overwrite — and,
// because the completion flips are scheduled HERE (transactionally with the
// write), a discarded apply also arms no flips.
export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const subject = await getSyncSubject(ctx.db, 'industryJobs', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));
    const now = Date.now();

    // Orphan cleanup: a character no longer linked to this user (unlinked, or
    // reassigned to another pilot) must not keep serving its old snapshot.
    // Any flip still scheduled for a deleted doc no-ops on the missing job.
    const enumerated = new Set(args.enumeratedCharacterIds);
    for (const doc of docs) {
      if (!enumerated.has(doc.characterId)) {
        await ctx.db.delete(doc._id);
      }
    }

    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      const existing = byCharacter.get(result.characterId);
      const refreshed = result.error === null;

      // A fresh body replaces the board wholesale (one endpoint — no merge);
      // a 304 or an errored read keeps the existing payload.
      let data = existing?.data ?? null;
      if (result.jobs !== null) {
        // The at-write derivation: ESI reports status lazily, so a job whose
        // end_date already passed lands as 'ready' here — a fresh body can
        // never regress a previously flipped job.
        const jobs = result.jobs.map((job) => ({
          ...job,
          status: deriveJobStatus(job.status, job.end_date, now),
        }));
        // Arm the completion flip for each job whose (job_id, end_date) is
        // new to this doc — content-deduped against the previous payload
        // (the #96 resolution; see flipsToSchedule for the guards and the
        // one accepted corner).
        for (const job of flipsToSchedule(existing?.data?.jobs ?? null, jobs, now)) {
          await ctx.scheduler.runAt(Date.parse(job.end_date), internal.industryJobs.markJobReady, {
            userId: args.userId,
            characterId: result.characterId,
            jobId: job.job_id,
            endDate: job.end_date,
          });
        }
        data = { jobs };
      }

      const fields = {
        data,
        jobsEtag: result.jobsEtag,
        lastSyncedAt: refreshed ? now : (existing?.lastSyncedAt ?? null),
        // An errored character must stay immediately re-syncable: carrying
        // the old cache window past an error would make the freshness gate
        // silently swallow the next mount/visible heartbeat until the stale
        // window expired. Successful results always carry a window (the
        // action falls back to now + 300s when ESI sends no Expires).
        expiresAt: refreshed ? result.expiresAt : null,
        syncError: result.error,
      };
      if (existing !== undefined) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert('industryJobsSync', {
          userId: args.userId,
          characterId: result.characterId,
          ...fields,
        });
      }
    }

    // Stamp the run's results onto the engine's subject row: the cache
    // window the next due time is computed from, the enumeration the
    // heartbeat hint checks against, and the rl* observability.
    const after = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    await ctx.db.patch(subject._id, {
      minExpiresAt: minCacheWindow(after.map((doc) => doc.expiresAt)),
      syncedCharacterIds: args.enumeratedCharacterIds,
      lastFinishedAt: now,
      lastError: args.lastError,
      rlGroup: args.rlGroup,
      rlLimit: args.rlLimit,
      rlRemaining: args.rlRemaining,
      rlUsed: args.rlUsed,
    });
    // status stays 'running' here — the workpool's onComplete owns the
    // lifecycle and clears it exactly once.
  },
});

// The scheduled completion transition: fires at a job's end_date and flips
// it to 'ready' so the open page updates live. Identity-guarded and
// throw-free — every disqualifying interleaving (job delivered, paused,
// re-priced to a new end_date, already flipped, doc wiped) is a clean no-op
// decided purely on stored state (see findFlipTarget). Deliberately NOT
// time-guarded: the scheduler fires at end_date by construction, and a
// hair-early no-op would orphan the job as 'active' forever. The flip does
// not touch expiresAt — freshness policy stays the engine's job (recorded
// 3.4.9 policy: a flip triggers no resync; ESI's lazy status means an
// instant re-read shows nothing new, and the next scheduled run picks up
// real state).
export const markJobReady = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.number(),
    jobId: v.number(),
    endDate: v.string(),
  },
  handler: async (ctx, { userId, characterId, jobId, endDate }) => {
    // .first(), not .unique(): a scheduled mutation that throws is terminal
    // (not retried), so a duplicate doc must never wedge the flip. The pair
    // is keyed unique by the apply path; flipping the first is correct either
    // way.
    const doc = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', userId).eq('characterId', characterId),
      )
      .first();
    if (doc === null || doc.data === null) return;
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
