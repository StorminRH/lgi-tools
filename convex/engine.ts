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
// mount/visible heartbeat dispatching immediately when stale), and
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
//
// ── Cost model (Convex billing; every function execution bills as one call,
// component internals and reactive re-runs included. Tiers verified 2026-06:
// Free & Starter — $0 base, pay-as-you-go once the included caps are passed
// (1M calls + 1 GB DB I/O + 20 GB-hr action compute / mo); Professional —
// $25/dev/mo (25M calls + 50 GB DB I/O). Passing Free's caps drops you onto
// Starter pay-as-you-go, not a Free→Pro cliff. ──
// Idle floor ≈ 94k calls/mo with zero traffic: this 30s scan (86.4k), the
// 15-min Vercel sweep chain (HTTP action + sweep mutation, 5.8k), and the
// Workpool's own 30-min healthcheck cron (1.4k). The sweep mutation's DB I/O is
// bounded by its live working sets — the overdue backlog, the concurrently-
// watched set, and per-run retention crossings — not by the total retained-
// subject count (3.5.e2 retired its full-table scan for three indexed ranges).
// Per visible tab: 3 heartbeats/min ≈ 180 calls/hr. Since 3.5.e1 each beat
// writes only the syncPresence row, so interval beats no longer re-run
// forViewer and no longer re-read the heavy tracker payload — the per-beat DB
// I/O term that bound first on Free for multi-alt users (a 5-alt watcher
// re-reading ~5 payloads 3×/min) is gone. Per dispatched run: ~11 marginal
// calls (limit + enqueue + wrapper + action + heldState + apply + complete +
// onComplete + ~3 forViewer echoes — a genuine status change still re-runs
// forViewer) plus ~34 Workpool main-loop calls (its 200ms cooldown polling;
// amortizes across a burst).
// Watched-hour ≈ 2.9k calls skills (60-run floor), ~0.7k jobs (12) → both-
// tracker hours ≈ 250/mo on Free, ~6,900 on Pro. Calls do NOT scale with
// characters-per-user — characters multiply ESI reads inside ONE action
// (action compute + bandwidth scale, calls don't) — and since 3.5.e1 DB I/O
// no longer scales with the payload re-read on every beat either.
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { vOnCompleteArgs, Workpool } from '@convex-dev/workpool';
import { v } from 'convex/values';
import {
  classifyDueSubject,
  COLD_AFTER_MS,
  computeNextDueAt,
  hasSyncTarget,
  isColdFromPresence,
  isRunningFresh,
  isStaleForImmediate,
  RETENTION_MS,
  SYNC_DATASET_CONFIG,
  type SyncDataset,
} from '@/lib/sync-engine';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { getPresence, getSyncSubject } from './lib/subjects';

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
const syncDatasetValidator = v.union(
  v.literal('skills'),
  v.literal('industryJobs'),
  v.literal('corpIndustryJobs'),
  v.literal('onlineStatus'),
);

const SYNC_REFS = {
  skills: internal.skillsSync.syncUser,
  industryJobs: internal.industryJobsSync.syncUser,
  corpIndustryJobs: internal.corpIndustryJobsSync.syncUser,
  onlineStatus: internal.onlineStatusSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

// Pass C (abandoned-row GC) deletes at most this many past-retention subjects
// per sweep, oldest first, so a post-outage backlog can't blow the mutation's
// ~4,096 db.get/query budget — the next 15-min run drains the rest. Far above
// any healthy per-run retention-crossing count, and A+B's live working sets
// leave the shared budget comfortable.
const SWEEP_DELETE_BATCH = 512;

// The overdue/hot-set dispatch passes — the 30s scan and the sweep's Pass A and
// Pass B — read at most this many subjects per run, oldest-first, so a large due
// or hot set can't approach Convex's ~4,096 index-range-read per-mutation ceiling
// (docs/CONVEX.md), the one capacity wall no tier lifts. A backlog drains over
// subsequent runs (the scan's 30s tick, the sweep's 15-min run) — same posture as
// Pass C's SWEEP_DELETE_BATCH. 1024 = 2× SWEEP_DELETE_BATCH and a 4× margin below
// the ceiling; far above any realistic single-run set (the audit models ~0.021×
// users due/tick → ~210 at 10k users, not reached until tens of thousands), so
// normal operation stays single-run. Per-row cost against the ceiling is one
// indexed presence/subject read — the dispatch path's rate-limiter + workpool
// calls are isolated Convex components, billed against their own budget.
export const SCAN_DISPATCH_BATCH = 1024;

// One structured line when a bounded dispatch pass hit its cap — the next run
// drains the rest (NOT silent truncation), oldest-first. Shared by the scan and
// the sweep's overdue + dropped passes (all new log lines). Pass C's retention
// GC keeps its own long-standing warn with its deletedThisRun field, so existing
// log queries don't lose it.
function logBatchCapped(scope: string, note: string, processed: number): void {
  console.warn(JSON.stringify({ scope, note, processed }));
}

// The overdue range shared by the 30s scan and the sweep's Pass A: due subjects
// (nextDueAt in (0, now]) oldest-first, capped at SCAN_DISPATCH_BATCH so neither
// reader can approach the per-mutation read ceiling. A dispatched/retired/deleted
// row leaves the range, so a backlog drains over subsequent runs.
function dueSubjects(ctx: MutationCtx, now: number): Promise<Doc<'syncSubjects'>[]> {
  return ctx.db
    .query('syncSubjects')
    .withIndex('by_next_due', (q) => q.gt('nextDueAt', 0).lte('nextDueAt', now))
    .take(SCAN_DISPATCH_BATCH);
}

// The liveness signal and the on-view trigger. Every beat refreshes presence
// — written to the syncPresence row, a doc forViewer never reads, so an
// interval beat no longer re-runs the heavy tracker payload (3.5.e1). Interval
// beats stop at the presence write (the scan owns the cadence — letting them
// dispatch would turn an errored subject into a 20s retry hammer) and so never
// even touch the subject row. Mount/visible beats also dispatch immediately
// when the data is stale or the viewer brought an unsynced character, which is
// what makes opening a tracker (or returning to it) land a fresh sync at once
// — and an errored run clears the cache window, so the next such beat retries
// right away. The hint never grants access — the action re-enumerates the
// user's characters from Neon on every run.
export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    const userId = identity.subject;
    const now = Date.now();

    // Presence first, for every reason — into syncPresence, never the subject
    // row. This is the decoupling: an interval beat writes only this doc and
    // returns, so it cannot invalidate forViewer's read of syncSubjects.
    const presence = await getPresence(ctx.db, dataset, userId);
    if (presence === null) {
      await ctx.db.insert('syncPresence', { dataset, userId, lastSeenAt: now });
    } else {
      await ctx.db.patch(presence._id, { lastSeenAt: now });
    }

    if (reason === 'interval') return;

    // Mount/visible only: the on-view dispatch path. Reads — and on the first
    // beat creates — the subject row. The client always fires a mount/visible
    // beat before starting its interval timer, so the row exists before any
    // interval beat arrives; intervals no longer create it.
    let subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) {
      const id = await ctx.db.insert('syncSubjects', {
        dataset,
        userId,
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
    }

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
    // Bounded oldest-due-first (by_next_due ascends on nextDueAt). A dispatched
    // row re-arms nextDueAt one cadence out and a retired row nulls it, so both
    // leave this range — a genuine backlog drains deterministically over
    // subsequent 30s ticks. A skipped running-fresh row keeps its small nextDueAt
    // and can be re-selected, but it ages out of isRunningFresh within
    // STALE_RUNNING_MS and is then taken over (nextDueAt advances), so it can't
    // hold a batch slot indefinitely; worst-case added drain latency behind a
    // running-fresh cluster is bounded by STALE_RUNNING_MS. (Only skills can be
    // overdue-and-running-fresh: jobs/corp cadence 300s > the 180s stale
    // threshold, so they're never fresh by the time they re-come-due.)
    const due = await dueSubjects(ctx, now);
    for (const subject of due) {
      // Presence is its own doc now (3.5.e1) — one point read per due row,
      // only over the hot, already-scheduled set. A missing doc reads as cold.
      const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
      if (isColdFromPresence(presence?.lastSeenAt ?? null, now)) {
        await ctx.db.patch(subject._id, { nextDueAt: null });
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      await dispatch(ctx, subject, now);
    }
    if (due.length === SCAN_DISPATCH_BATCH) logBatchCapped('engine:scan', 'scan_batch_capped', due.length);
  },
});

// Start one run for a subject: rate-limit per token group, enqueue the
// dataset's sync action, mark the row running. lastRequestedAt is the
// generation token (a superseded run's late apply no-ops on it) and workId
// pairs the run with its completion. nextDueAt is parked one cadence out so
// the row stays in the scan set — a healthy completion overwrites it; a
// wedged run gets taken over by the scan after STALE_RUNNING_MS.
//
// Why a millisecond timestamp is a sound generation token despite the
// granularity (3.5.e3 verification): a SUPERSEDING dispatch overwrites
// lastRequestedAt only after isRunningFresh is false, which for a still-'running'
// row forces a ≥STALE_RUNNING_MS gap — so the new token can never equal the run
// it supersedes, and the old run's late apply no-ops on the mismatch. Concurrent
// same-subject dispatches are OCC-serialized on this row (the enqueue and the
// patch below commit as ONE transaction), so exactly one run ever holds a given
// token; the loser re-runs, re-reads the now-'running' row, and isRunningFresh
// bails it. Load-bearing if refactoring: keep the enqueue transactional with —
// and before — the patch; keep STALE_RUNNING_MS ≫ run duration; keep
// isRunningFresh inside the handler so it's re-checked on each OCC retry.
// Returns true iff a run was actually enqueued. A rate-limiter refusal parks
// nextDueAt and returns false WITHOUT enqueuing — the sweep's `dispatched`
// counter (the watchdog's "is the Convex scan alive?" signal) must not count
// it, or a re-arm herd that the limiter smooths reads as a dead scan.
async function dispatch(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  now: number,
): Promise<boolean> {
  const { cadenceFloorMs, tokenGroup } = SYNC_DATASET_CONFIG[subject.dataset];
  const { ok, retryAfter } = await rateLimiter.limit(ctx, 'syncDispatch', { key: tokenGroup });
  if (!ok) {
    await ctx.db.patch(subject._id, { nextDueAt: now + retryAfter });
    return false;
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
  return true;
}

// Exactly-once run epilogue from the Workpool: clear 'running', surface a
// terminal failure, and arm the next due time — off the cache window the
// apply just stamped, floored at the dataset cadence, plus jitter (group
// staggering). Matched by workId, so a taken-over run's late completion
// no-ops rather than clearing the new run's status. A successful run that
// synced nothing parks at null until a heartbeat brings targets; a failed
// run always re-arms (rationale inline below).
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
      // A failed run re-arms at the cadence floor even when nothing is
      // synced yet: a first-ever run failing terminally would otherwise park
      // nextDueAt null and leave the scan set, so a viewer staying on the
      // page would get no retry at all. The scan's cold-retire still cleans
      // the row once the viewer leaves.
      nextDueAt: failed
        ? computeNextDueAt(null, cadenceFloorMs, now)
        : subject.syncedCharacterIds.length === 0
          ? null
          : computeNextDueAt(subject.minExpiresAt, cadenceFloorMs, now),
      // A terminal failure means the apply never ran, so the old cache
      // window is unverified — clear it (the #95 "errored, re-syncable now"
      // meaning) so the next mount/visible heartbeat dispatches immediately
      // instead of treating the stale window as fresh. The scan still paces
      // retries at the cadence floor.
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
//
// Three bounded indexed passes, never a full-table scan (3.5.e2). Each reads
// only the rows that can need action, so the work scales with live working
// sets — not the total retained-subject count — and each is ALSO row-capped
// (oldest-first .take()) so no pass can approach the ~4,096-read per-mutation
// ceiling, draining any backlog over subsequent runs:
//   A. overdue — by_next_due over (0, now], the 30s scan's own range: delete
//      past-retention / retire cold-within-retention / dispatch hot. Capped at
//      SCAN_DISPATCH_BATCH (≈0 on a healthy system, but the scan's own cap now
//      lets a backlog form — this recovery pass must not read it unbounded).
//   B. dropped — by_last_seen over hot presence (lastSeenAt ≥ now−COLD): a hot
//      idle row with targets but no schedule (timer wiped mid-flight) is
//      re-armed. Capped at SCAN_DISPATCH_BATCH (a backstop sample of the
//      concurrently-watched set; the on-view heartbeat is the primary re-arm).
//   C. abandoned — by_last_seen over past-retention presence (lastSeenAt <
//      now−RETENTION): delete subject + presence, oldest first, capped per run
//      at SWEEP_DELETE_BATCH. Bounded by per-run retention crossings.
// A runs first so its writes are visible (read-your-writes) to B/C: a row A
// dispatched leaves the null-scheduled set B scans, and a row A deleted is gone
// from C's presence range, so no row is acted on twice. The cold-but-within-
// retention middle band is never scanned — it needs nothing until it comes due
// (A) or ages out (C).
// NOTE: a subject with NO presence doc sits in none of these ranges, so the
// sweep does not delete it. Correct in steady state — presence and subject are
// created together (heartbeat) and only ever deleted together (here), so no such
// orphan is ever produced. The fixed pre-e1 legacy orphan population that
// predated this coupling was reaped, and the lastSeenAt tombstone dropped, by the
// e3 one-shot migration.
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const counts: SweepCounts = { dispatched: 0, retired: 0, deleted: 0 };
    // A runs first so its writes are visible (read-your-writes) to B/C: a row A
    // dispatched leaves the null-scheduled set B scans, and a row A deleted is
    // gone from C's presence range, so no row is acted on twice.
    await sweepOverdue(ctx, now, counts);
    await sweepDropped(ctx, now, counts);
    await sweepAbandoned(ctx, now, counts);
    return counts;
  },
});

interface SweepCounts {
  dispatched: number;
  retired: number;
  deleted: number;
}

// Pass A — overdue. The 30s scan's own range; one presence point read per due
// row, only over the hot, already-scheduled set. Delete past-retention /
// never-seen rows, retire cold-within-retention, dispatch hot.
async function sweepOverdue(ctx: MutationCtx, now: number, counts: SweepCounts): Promise<void> {
  // Same bounded oldest-due-first range as the 30s scan (and the same per-row
  // presence read). Capped at SCAN_DISPATCH_BATCH so that once the scan's own cap
  // lets an overdue backlog form, this recovery pass can't read it unbounded into
  // the 4,096-read ceiling — it drains the rest on the next 15-min run.
  const due = await dueSubjects(ctx, now);
  for (const subject of due) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    switch (
      classifyDueSubject(presence?.lastSeenAt ?? null, subject.status, subject.lastRequestedAt, now)
    ) {
      case 'delete':
        await ctx.db.delete(subject._id);
        if (presence !== null) await ctx.db.delete(presence._id);
        counts.deleted += 1;
        break;
      case 'retire':
        await ctx.db.patch(subject._id, { nextDueAt: null });
        counts.retired += 1;
        break;
      case 'dispatch':
        if (await dispatch(ctx, subject, now)) counts.dispatched += 1;
        break;
      case 'skip':
        break;
    }
  }
  if (due.length === SCAN_DISPATCH_BATCH) logBatchCapped('engine:sweep', 'overdue_batch_capped', due.length);
}

// Pass B — dropped timers: a hot, idle subject with targets but no schedule
// (e.g. state wiped mid-flight). Only the hot presence rows; Pass A already
// owns anything still scheduled, so a non-null nextDueAt is its province.
async function sweepDropped(ctx: MutationCtx, now: number, counts: SweepCounts): Promise<void> {
  // Bounded read over the hot presence set (by_last_seen ascends, so oldest-seen
  // first). Unlike the overdue passes this is a backstop, not a drain: a re-armed
  // row keeps its presence (stays in by_last_seen), and the on-view heartbeat is
  // the PRIMARY dropped-timer re-arm — so capping the read only means a hot row
  // beyond the cap is reconciled by its own next heartbeat or a later sweep as its
  // lastSeenAt rotates toward the cap window. The cap buys ceiling-safety only.
  const hot = await ctx.db
    .query('syncPresence')
    .withIndex('by_last_seen', (q) => q.gte('lastSeenAt', now - COLD_AFTER_MS))
    .take(SCAN_DISPATCH_BATCH);
  for (const presence of hot) {
    const subject = await getSyncSubject(ctx.db, presence.dataset, presence.userId);
    if (subject === null || subject.nextDueAt !== null) continue;
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
    if (
      hasSyncTarget(subject.syncedCharacterIds, []) &&
      isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, [], now)
    ) {
      if (await dispatch(ctx, subject, now)) counts.dispatched += 1;
    }
  }
  if (hot.length === SCAN_DISPATCH_BATCH) logBatchCapped('engine:sweep', 'dropped_batch_capped', hot.length);
}

// Pass C — abandoned: past-retention presence (oldest first), deleted with its
// subject. Capped per run so a post-outage backlog can't blow the mutation's
// call budget; the next run takes the next oldest batch.
async function sweepAbandoned(ctx: MutationCtx, now: number, counts: SweepCounts): Promise<void> {
  const abandoned = await ctx.db
    .query('syncPresence')
    .withIndex('by_last_seen', (q) => q.lt('lastSeenAt', now - RETENTION_MS))
    .take(SWEEP_DELETE_BATCH);
  for (const presence of abandoned) {
    const subject = await getSyncSubject(ctx.db, presence.dataset, presence.userId);
    if (subject !== null) {
      await ctx.db.delete(subject._id);
      counts.deleted += 1;
    }
    await ctx.db.delete(presence._id);
  }
  if (abandoned.length === SWEEP_DELETE_BATCH) {
    // Not silent truncation: the next 15-min run drains the next oldest batch.
    console.warn(
      JSON.stringify({
        scope: 'engine:sweep',
        note: 'retention_batch_capped',
        deletedThisRun: counts.deleted,
      }),
    );
  }
}
