// Industry-jobs tracker — the Convex half of the 3.4.8 sync flow, mirroring
// the 3.4.7 skills tracker (convex/skills.ts) by design.
//
// Canonical shape: client → requestSync (mutation, records intent) →
// Action Retrier → industryJobsSync.syncUser (action, talks to Neon + ESI) →
// applySyncResults (ONE batched mutation) → forViewer (reactive query).
// The client never calls the action directly, and no client-posted character
// id carries authority — the action re-enumerates the user's characters
// server-side on every run.
//
// New in this tracker: the scheduled completion transition. applySyncResults
// derives 'ready' for any job whose end_date already passed and schedules a
// markJobReady mutation at end_date for every still-running job — so an open
// page sees the flip the moment the job completes, with no polling. The flip
// is identity-guarded (job_id + verbatim end_date) and idempotent, so a
// re-sync that changed or removed a job makes a stale flip a no-op; the next
// fresh body always re-derives, so a missed flip can never wedge a job.
import { ActionRetrier, onCompleteValidator } from '@convex-dev/action-retrier';
import { v } from 'convex/values';
import { deriveJobStatus, findFlipTarget } from '@/features/industry-jobs/job-state';
import { components, internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { industryJobValidator } from './schema';

const retrier = new ActionRetrier(components.actionRetrier);

// A 'running' status older than this is treated as stuck (e.g. the
// onComplete callback itself failed) and taken over by the next request —
// without it one wedged run would block the user's syncs forever.
const STALE_RUNNING_MS = 3 * 60_000;

// Convex's scheduler rejects a timestamp more than five years out; 5×365 days
// stays safely under that ceiling. A flip scheduled past it is skipped (a
// real EVE job never ends that far out — it would be contract drift).
const SCHEDULE_HORIZON_MS = 5 * 365 * 24 * 60 * 60_000;

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
    const state = await ctx.db
      .query('industryJobsSyncStates')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
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

// Records sync intent and schedules the action — IF a sync is warranted.
// `characterIdsHint` is a freshness hint only (the viewer's characters as the
// page server-rendered them): a hinted id with no doc means "new character,
// sync now". It never grants access — the action enumerates the user's real
// characters from Neon and ignores the hint entirely.
export const requestSync = mutation({
  args: { characterIdsHint: v.array(v.number()) },
  handler: async (ctx, { characterIdsHint }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    const userId = identity.subject;
    const now = Date.now();

    const state = await ctx.db
      .query('industryJobsSyncStates')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (state !== null && state.status === 'running' && now - state.lastRequestedAt < STALE_RUNNING_MS) {
      return;
    }

    const docs = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    if (characterIdsHint.length === 0 && docs.length === 0) return;
    const syncedIds = new Set(docs.map((doc) => doc.characterId));
    const allHintedKnown = characterIdsHint.every((id) => syncedIds.has(id));
    const allFresh = docs.every((doc) => doc.expiresAt !== null && now < doc.expiresAt);
    if (allHintedKnown && allFresh) return;

    let stateId = state?._id;
    if (stateId === undefined) {
      stateId = await ctx.db.insert('industryJobsSyncStates', {
        userId,
        status: 'running',
        runId: null,
        lastRequestedAt: now,
        lastFinishedAt: null,
        lastError: null,
        rlGroup: null,
        rlLimit: null,
        rlRemaining: null,
        rlUsed: null,
      });
    } else {
      await ctx.db.patch(stateId, { status: 'running', lastRequestedAt: now });
    }
    const runId = await retrier.run(
      ctx,
      internal.industryJobsSync.syncUser,
      { userId, generation: now },
      { onComplete: internal.industryJobs.syncComplete },
    );
    await ctx.db.patch(stateId, { runId });
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
// userId+characterId), so an Action Retrier retry that re-runs the action
// cannot double-write; the generation guard makes a superseded run's late
// apply a no-op instead of an overwrite — and, because the completion flips
// are scheduled HERE (transactionally with the write), a discarded apply
// also arms no flips.
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
    const state = await ctx.db
      .query('industryJobsSyncStates')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (state === null || state.lastRequestedAt !== args.generation) return;

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
        data = { jobs };
        // Schedule the completion flip for every still-running job. Always
        // scheduled, never deduped: the identity-guarded flip absorbs
        // duplicates, and 304s schedule nothing, so pending rows scale with
        // bodies that actually changed — a few hundred a day at the busiest,
        // far below any scheduler concern.
        for (const job of jobs) {
          if (job.status !== 'active') continue;
          const end = Date.parse(job.end_date);
          // Skip an unparseable or absurd end_date instead of letting it throw:
          // runAt rejects a timestamp more than five years out, and a throw
          // here would roll back the whole batch and storm the retrier. Real
          // EVE jobs end in hours-to-weeks, so a far-future date is contract
          // drift; a future resync schedules it once it's within the horizon.
          if (!Number.isFinite(end) || end - now > SCHEDULE_HORIZON_MS) continue;
          await ctx.scheduler.runAt(end, internal.industryJobs.markJobReady, {
            userId: args.userId,
            characterId: result.characterId,
            jobId: job.job_id,
            endDate: job.end_date,
          });
        }
      }

      const fields = {
        data,
        jobsEtag: result.jobsEtag,
        lastSyncedAt: refreshed ? now : (existing?.lastSyncedAt ?? null),
        // An errored character must stay immediately re-syncable: carrying
        // the old cache window past an error would make the freshness gate
        // silently swallow "Sync now" until the stale window expired.
        // Successful results always carry a window (the action falls back to
        // now + 300s when ESI sends no Expires).
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

    await ctx.db.patch(state._id, {
      lastFinishedAt: now,
      lastError: args.lastError,
      rlGroup: args.rlGroup,
      rlLimit: args.rlLimit,
      rlRemaining: args.rlRemaining,
      rlUsed: args.rlUsed,
    });
    // status stays 'running' here — the retrier's onComplete owns the
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
// not touch expiresAt — freshness policy stays the sync gate's job.
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

// Exactly-once run epilogue from the Action Retrier: clear 'running' and
// surface a terminal failure. Looks the run up by its runId — a taken-over
// run's state row already carries a newer runId, so the lookup misses and
// this no-ops rather than clearing the new run's status.
export const syncComplete = internalMutation({
  args: onCompleteValidator,
  handler: async (ctx, { runId, result }) => {
    const state = await ctx.db
      .query('industryJobsSyncStates')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .unique();
    if (state === null) return;
    await ctx.db.patch(state._id, {
      status: 'idle',
      runId: null,
      ...(result.type === 'failed'
        ? { lastError: `sync_failed: ${result.error.slice(0, 500)}` }
        : {}),
    });
  },
});
