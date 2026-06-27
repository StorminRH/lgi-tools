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
import { v, type Infer } from 'convex/values';
import { deriveJobStatus, findFlipTarget, flipsToSchedule } from '@/features/industry-jobs/job-state';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, query } from './_generated/server';
import { stampSyncSubject } from './lib/characterSync';
import { getSyncSubject } from './lib/subjects';
import { industryJobValidator } from './schema';

// The COLD half of the viewer split (SA.5): the calling user's synced job
// boards, keyed by character. Its read set is industryJobsSyncData alone — so it
// re-fires only on a genuine job-board change (a fresh body or a markJobReady
// completion flip), never on a per-cycle 304/dispatch/completion. The client
// joins it with runStateForViewer by character id.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('industryJobsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, data: doc.data })),
    };
  },
});

// The HOT half of the viewer split (SA.5): per-character freshness/error plus
// the run lifecycle. Reads only the small hot meta docs (industryJobsSync) and
// the subject row, so it re-fires every cycle cheaply.
export const runStateForViewer = query({
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
    // Cold-doc presence is the data-presence gate after the split (a cold doc
    // exists iff that character holds a board), so the held etag is only offered
    // when a 304 would actually have a payload to confirm.
    const coldDocs = await ctx.db
      .query('industryJobsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const hasData = new Set(coldDocs.map((doc) => doc.characterId));
    return docs.map((doc) => ({
      characterId: doc.characterId,
      jobsEtag: hasData.has(doc.characterId) ? doc.jobsEtag : null,
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
type CharacterResult = Infer<typeof characterResultValidator>;

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
    // The cold payload docs, loaded alongside so each result's apply gets its
    // existing board and orphan cleanup can delete both halves together.
    const coldDocs = await ctx.db
      .query('industryJobsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const coldByCharacter = new Map(coldDocs.map((doc) => [doc.characterId, doc]));
    const now = Date.now();
    const enumerated = new Set(args.enumeratedCharacterIds);

    // The post-apply cache window per surviving character, accumulated as we go
    // so we don't re-read the whole industryJobsSync set just to re-derive it
    // for the subject stamp. Seed from the enumerated docs that survive orphan
    // cleanup; each applied result overwrites its character's window below.
    const windowsByCharacter = new Map<number, number | null>();
    for (const doc of docs) {
      if (enumerated.has(doc.characterId)) {
        windowsByCharacter.set(doc.characterId, doc.expiresAt);
      } else {
        // Orphan cleanup: a character no longer linked to this user (unlinked,
        // or reassigned) must not keep serving its old snapshot. Delete BOTH the
        // hot meta doc and the cold payload doc; any flip still scheduled for a
        // deleted doc no-ops on the missing job.
        await ctx.db.delete(doc._id);
        const cold = coldByCharacter.get(doc.characterId);
        if (cold !== undefined) await ctx.db.delete(cold._id);
      }
    }

    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      const expiresAt = await applyJobResult(
        ctx,
        args.userId,
        result,
        byCharacter.get(result.characterId),
        coldByCharacter.get(result.characterId),
        now,
      );
      windowsByCharacter.set(result.characterId, expiresAt);
    }

    // Stamp the run's results onto the engine's subject row: the cache
    // window the next due time is computed from, the enumeration the
    // heartbeat hint checks against, and the rl* observability.
    await stampSyncSubject(ctx, subject._id, [...windowsByCharacter.values()], args, now);
    // status stays 'running' here — the workpool's onComplete owns the
    // lifecycle and clears it exactly once.
  },
});

// Upsert one character's job board. A fresh body replaces the board wholesale
// (one endpoint — no merge) and derives each job's at-write status (ESI reports
// status lazily, so a job past its end_date lands 'ready' here, and a fresh
// body can never regress a previously flipped job), arming a completion flip
// for each (job_id, end_date) new to this doc — content-deduped against the
// previous payload (the #96 resolution; see flipsToSchedule). A 304 or an
// errored read keeps the existing payload; an errored read clears the cache
// window so the next heartbeat re-syncs immediately.
async function applyJobResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existingHot: Doc<'industryJobsSync'> | undefined,
  existingCold: Doc<'industryJobsSyncData'> | undefined,
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
    await ctx.db.insert('industryJobsSync', { userId, characterId: result.characterId, ...hotFields });
  }

  // Cold payload: a fresh body replaces the board wholesale and arms the
  // completion flips (content-deduped against the COLD doc's prior payload). A
  // 304 or an errored read leaves the cold doc — and the payload view — untouched.
  if (result.jobs !== null) {
    const jobs = result.jobs.map((job) => ({
      ...job,
      status: deriveJobStatus(job.status, job.end_date, now),
    }));
    for (const job of flipsToSchedule(existingCold?.data?.jobs ?? null, jobs, now)) {
      await ctx.scheduler.runAt(Date.parse(job.end_date), internal.industryJobs.markJobReady, {
        userId,
        characterId: result.characterId,
        jobId: job.job_id,
        endDate: job.end_date,
      });
    }
    const data = { jobs };
    if (existingCold !== undefined) {
      await ctx.db.patch(existingCold._id, { data });
    } else {
      await ctx.db.insert('industryJobsSyncData', { userId, characterId: result.characterId, data });
    }
  }

  // The resulting cache window, returned so the caller can accumulate the
  // post-apply set without re-reading the whole table.
  return hotFields.expiresAt;
}

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
      .query('industryJobsSyncData')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', userId).eq('characterId', characterId),
      )
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
