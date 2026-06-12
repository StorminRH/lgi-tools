// THE presence-gated sync engine (3.4.9, Decision Record 12) — the one
// sanctioned presence/scheduling machinery. A subject (dataset × user) is
// refreshed on its dataset's cadence only while some visible tab is
// heartbeating it; cost scales with concurrently-watched subjects, never
// with total linked characters.
//
// Registration seam (how a consumer joins — and ALL it does):
//   1. Add the dataset + cadence floor + token group to SYNC_DATASETS /
//      SYNC_DATASET_CONFIG in src/lib/sync-engine.ts and to the schema's
//      dataset union.
//   2. Point SYNC_REFS below at its internal sync action ({userId,
//      generation} args; error taxonomy: only transient failures throw).
//   3. Its applySyncResults guards on the subject's generation and stamps
//      run results back via the syncSubjects row (minExpiresAt,
//      syncedCharacterIds, rl*, lastError, lastFinishedAt).
//   4. Its view mounts the useSyncSubject hook (src/data/convex/).
// Trigger classes: 'while-watched' (this engine's scan), 'on-view' (a
// mount/visible/manual heartbeat dispatching immediately when stale), and
// 'on-schedule' (feature-local scheduled transitions, e.g. the jobs
// tracker's markJobReady flip — the engine schedules refreshes, never flips).
//
// Mechanism: heartbeats maintain presence and dispatch immediately when the
// data is stale; a static 30s cron (convex/crons.ts) scans subjects whose
// nextDueAt has arrived, skips cold or still-running ones, and dispatches
// the rest through the Workpool (bounded parallelism + durable retries) with
// per-token-group rate smoothing. nextDueAt is written when a run completes
// — "next run after the last finished", CCP's staggering guidance — off the
// stored ESI cache windows, floored at the dataset cadence, plus jitter.
// Dedup is the subject row itself: one running guard, one workId, one
// generation token, all serialized by Convex OCC. Cold-stop is simply the
// scan skipping the subject — nothing to cancel or tear down.
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { vOnCompleteArgs, Workpool } from '@convex-dev/workpool';
import { v } from 'convex/values';
import {
  computeNextDueAt,
  hasSyncTarget,
  isCold,
  isRunningFresh,
  isStaleForImmediate,
  SYNC_DATASET_CONFIG,
  type SyncDataset,
} from '@/lib/sync-engine';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { getSyncSubject } from './lib/subjects';

// Bounded fan-out across hot subjects. Retries ride the pool (exponential
// backoff; the actions' error taxonomy already reserves throwing for
// transient failures, so a retry is always safe and idempotent — the
// generation guard makes a duplicate apply a no-op).
const pool = new Workpool(components.workpool, { maxParallelism: 4 });

// Dispatch smoothing per ESI token-bucket group — a herd guard for re-arm
// bursts (deploy, sweep), NOT a budget: the gate's Redis scoreboard stays
// the one authority on ESI spend. 30 runs/min per group with a burst
// capacity of 10 is far above normal load (a hot subject costs one run per
// cadence floor).
const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

// Must enumerate the same datasets as SYNC_DATASETS (src/lib/sync-engine.ts)
// and the schema's dataset union.
const syncDatasetValidator = v.union(v.literal('skills'), v.literal('industryJobs'));

const SYNC_REFS = {
  skills: internal.skillsSync.syncUser,
  industryJobs: internal.industryJobsSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

// Subjects older than this with no heartbeat are deleted by the sweep —
// pure housekeeping; a returning viewer's first heartbeat recreates the row.
const RETENTION_MS = 7 * 24 * 60 * 60_000;

// The liveness signal and the on-view trigger. Every beat refreshes
// presence; interval beats stop there (the scan owns the cadence — letting
// them dispatch would turn an errored subject into a 20s retry hammer).
// Mount/visible/manual beats also dispatch immediately when the data is
// stale or the viewer brought an unsynced character, which is what makes
// opening a tracker (or returning to it, or clicking "Sync now") land a
// fresh sync at once. The hint never grants access — the action
// re-enumerates the user's characters from Neon on every run.
export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(
      v.literal('mount'),
      v.literal('visible'),
      v.literal('interval'),
      v.literal('manual'),
    ),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    const userId = identity.subject;
    const now = Date.now();

    let subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) {
      const id = await ctx.db.insert('syncSubjects', {
        dataset,
        userId,
        lastSeenAt: now,
        status: 'idle',
        lastRequestedAt: 0,
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
      subject = await ctx.db.get(id);
      if (subject === null) return;
    } else {
      await ctx.db.patch(subject._id, { lastSeenAt: now });
    }

    if (reason === 'interval') return;
    if (!hasSyncTarget(subject.syncedCharacterIds, characterIdsHint)) return;
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return;
    if (!isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, characterIdsHint, now)) {
      // Still fresh, but a return inside the cache window finds the subject
      // retired from the scan set (the cold branch nulled nextDueAt) — re-arm
      // the schedule off the held window so the cadence resumes without
      // waiting for staleness or the sweeper.
      if (subject.nextDueAt === null) {
        const { cadenceFloorMs } = SYNC_DATASET_CONFIG[subject.dataset];
        await ctx.db.patch(subject._id, {
          nextDueAt: computeNextDueAt(
            subject.minExpiresAt,
            cadenceFloorMs,
            subject.lastFinishedAt ?? now,
          ),
        });
      }
      return;
    }
    await dispatch(ctx, subject, now);
  },
});

// The 30s dispatcher (convex/crons.ts): one indexed range over due
// subjects. Cold rows are retired from the scan set (nextDueAt null — the
// returning viewer's heartbeat revives them); fresh-running rows are left
// for their completion to re-arm; a running row past STALE_RUNNING_MS is
// presumed wedged and taken over here, automatically.
export const scan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('syncSubjects')
      .withIndex('by_next_due', (q) => q.gt('nextDueAt', 0).lte('nextDueAt', now))
      .collect();
    for (const subject of due) {
      if (isCold(subject.lastSeenAt, now)) {
        await ctx.db.patch(subject._id, { nextDueAt: null });
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      await dispatch(ctx, subject, now);
    }
  },
});

// Start one run for a subject: rate-limit per token group, enqueue the
// dataset's sync action, mark the row running. lastRequestedAt is the
// generation token (a superseded run's late apply no-ops on it) and workId
// pairs the run with its completion. nextDueAt is parked one cadence out so
// the row stays in the scan set — a healthy completion overwrites it; a
// wedged run gets taken over by the scan after STALE_RUNNING_MS.
async function dispatch(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  now: number,
): Promise<void> {
  const { cadenceFloorMs, tokenGroup } = SYNC_DATASET_CONFIG[subject.dataset];
  const { ok, retryAfter } = await rateLimiter.limit(ctx, 'syncDispatch', { key: tokenGroup });
  if (!ok) {
    await ctx.db.patch(subject._id, { nextDueAt: now + retryAfter });
    return;
  }
  const workId = await pool.enqueueAction(
    ctx,
    SYNC_REFS[subject.dataset],
    { userId: subject.userId, generation: now },
    {
      retry: { maxAttempts: 4, initialBackoffMs: 1000, base: 2 },
      onComplete: internal.engine.onSyncComplete,
      context: { dataset: subject.dataset, userId: subject.userId },
    },
  );
  await ctx.db.patch(subject._id, {
    status: 'running',
    lastRequestedAt: now,
    workId,
    nextDueAt: now + cadenceFloorMs,
  });
}

// Exactly-once run epilogue from the Workpool: clear 'running', surface a
// terminal failure, and arm the next due time — off the cache window the
// apply just stamped, floored at the dataset cadence, plus jitter (group
// staggering). Matched by workId, so a taken-over run's late completion
// no-ops rather than clearing the new run's status. A subject with nothing
// synced and nothing hinted parks at null until a heartbeat brings targets.
export const onSyncComplete = internalMutation({
  args: vOnCompleteArgs(v.object({ dataset: syncDatasetValidator, userId: v.string() })),
  handler: async (ctx, { workId, context, result }) => {
    const subject = await getSyncSubject(ctx.db, context.dataset, context.userId);
    if (subject === null || subject.workId !== workId) return;
    const now = Date.now();
    const { cadenceFloorMs } = SYNC_DATASET_CONFIG[subject.dataset];
    const failed = result.kind === 'failed';
    if (failed) {
      // Mirror of the Vercel crons' structured boundary line — the Convex
      // log stream is this engine's observability surface.
      console.error(
        JSON.stringify({
          scope: 'engine:sync',
          dataset: subject.dataset,
          outcome: 'failed',
          error: result.error.slice(0, 500),
        }),
      );
    }
    await ctx.db.patch(subject._id, {
      status: 'idle',
      workId: null,
      nextDueAt:
        subject.syncedCharacterIds.length === 0
          ? null
          : computeNextDueAt(failed ? null : subject.minExpiresAt, cadenceFloorMs, now),
      // A terminal failure means the apply never ran, so the old cache
      // window is unverified — clear it (the #95 "errored, re-syncable now"
      // meaning) so the next mount/visible/manual heartbeat dispatches
      // immediately instead of treating the stale window as fresh. The scan
      // still paces retries at the cadence floor.
      ...(failed
        ? { lastError: `sync_failed: ${result.error.slice(0, 500)}`, minExpiresAt: null }
        : {}),
    });
  },
});

// The external watchdog's worker (POST /sweep, convex/http.ts — driven by a
// 15-minute Vercel cron, a different failure domain from the Convex
// scheduler). Reconciles anything the 30s scan should have handled —
// `dispatched` staying 0 on a healthy system is the idempotence signal, and
// a non-zero count means the cron scan is dead or lagging. Also retires
// cold due rows and deletes long-abandoned subjects (regenerable state: a
// returning heartbeat recreates everything).
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const counts = { dispatched: 0, retired: 0, deleted: 0 };
    const subjects = await ctx.db.query('syncSubjects').collect();
    for (const subject of subjects) {
      if (isCold(subject.lastSeenAt, now)) {
        if (now - subject.lastSeenAt > RETENTION_MS) {
          await ctx.db.delete(subject._id);
          counts.deleted += 1;
        } else if (subject.nextDueAt !== null && subject.nextDueAt <= now) {
          await ctx.db.patch(subject._id, { nextDueAt: null });
          counts.retired += 1;
        }
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      const overdue = subject.nextDueAt !== null && subject.nextDueAt <= now;
      // A hot, idle subject with targets but no schedule is a dropped timer
      // (e.g. state wiped mid-flight) — re-arm it alongside overdue rows.
      const dropped =
        subject.nextDueAt === null &&
        hasSyncTarget(subject.syncedCharacterIds, []) &&
        isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, [], now);
      if (overdue || dropped) {
        await dispatch(ctx, subject, now);
        counts.dispatched += 1;
      }
    }
    return counts;
  },
});
