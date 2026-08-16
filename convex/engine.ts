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
// 'on-schedule' (feature-local scheduled transitions — the engine schedules
// refreshes, never flips). The on-schedule class has no live consumer since
// MIGRATE.B retired the jobs trackers' markReady flips (timer-derived client-side
// now); it is reserved for a future consumer such as the v4.0 mapper.
//
// Mechanism: heartbeats maintain presence and dispatch immediately when the
// data is stale; a static 30s cron (convex/crons.ts) scans subjects whose
// nextDueAt has arrived, skips cold or still-running ones, and schedules
// the rest as actions (ctx.scheduler.runAfter(0)) with per-token-group rate
// smoothing. nextDueAt is written when a run completes — "next run after
// the last finished", CCP's staggering guidance — off the stored ESI cache
// windows, floored at the dataset cadence. A clean yield or a thrown failure
// schedules the next hop at that instant; jitter only applies when the scan
// is the retry owner (zero-yield / cold). Dedup is the subject row itself:
// one running guard, one workId, one generation token, all serialized by
// Convex OCC. Cold-stop is simply the scan skipping the subject — nothing
// to cancel or tear down.
//
// ── Cost model (Convex billing; every function execution bills as one call,
// component internals and reactive re-runs included. Tiers verified 2026-06:
// Free & Starter — $0 base, pay-as-you-go once the included caps are passed
// (1M calls + 1 GB DB I/O + 20 GB-hr action compute / mo); Professional —
// $25/dev/mo (25M calls + 50 GB DB I/O). Passing Free's caps drops you onto
// Starter pay-as-you-go, not a Free→Pro cliff. ──
// Idle floor ≈ 92k calls/mo with zero traffic: this 30s scan (86.4k) and the
// 15-min Vercel sweep chain (HTTP action + sweep mutation, 5.8k). The sweep
// mutation's DB I/O is bounded by its live working sets — the overdue backlog,
// the concurrently-watched set, and per-run retention crossings — not by the
// total retained-subject count (3.5.e2 retired its full-table scan for three
// indexed ranges).
// Per watched tab: 3 heartbeats/min while visible (≈180 calls/hr); a HIDDEN
// tab keeps beating at the browser-throttled rate (~1/min) until the client
// AFK flow stops it (prompt after 1h continuously hidden, beats stop 5 min
// unanswered later) — HIDDEN_PRESENCE_MAX_MS (90 min without a visible beat)
// is the server backstop against a client that never stops. Since 3.5.e1 each
// beat writes only the syncPresence row, so interval beats no longer re-run
// forViewer and no longer re-read the heavy tracker payload — the per-beat DB
// I/O term that bound first on Free for multi-alt users (a 5-alt watcher
// re-reading ~5 payloads 3×/min) is gone. Per dispatched run: ~8 marginal
// calls (limit + schedule + action + heldState + apply + onComplete + ~3
// forViewer echoes — a genuine status change still re-runs forViewer).
// Watched-hour: characterLocation
// with chain-on-success is ~12 runs/min (~10k–30k calls/watched-hour) while
// the Atlas tab is OPEN — visible or hidden behind the game — AND a tracked
// pilot is online in EVE (BY DESIGN since the hidden-tab change: a hidden
// online pilot runs the full loop until the AFK flow stops it, ~25–40k calls
// per hidden stretch worst-case). All tracked pilots offline drops the
// subject to the ~60s online-probe cadence (≈2.7k calls/watched-hour) that
// auto-resumes the fast loop on the next login; zero once the tab closes
// (cold after the dataset's coldAfterMs) or the AFK stop lands. skills/jobs/
// corp all moved to Neon stale-gated on-view reads in MIGRATE.B.
// Calls do NOT scale with characters-per-user — characters multiply ESI reads
// inside ONE action (action compute + bandwidth scale, calls don't) — and since
// 3.5.e1 DB I/O no longer scales with the payload re-read on every beat either.
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';
import {
  classifyDueSubject,
  computeChainBoundary,
  computeNextDueAt,
  hasSyncTarget,
  isCold,
  isColdFromPresence,
  isRegisteredDataset,
  isRunningFresh,
  isStaleForImmediate,
  MAX_COLD_AFTER_MS,
  RETENTION_MS,
  SYNC_DATASET_CONFIG,
  SYNC_DATASETS,
  type SyncDataset,
} from '@/lib/sync-engine';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { clearCoverageForUser } from './lib/locationCoverage';
import { getPresence, getSyncSubject, newIdleSubject } from './lib/subjects';
import { drainCharacterOnline } from './onlineStatus';

// Dispatch smoothing per ESI token-bucket group — a herd guard for re-arm
// bursts (deploy, sweep), NOT a budget: the gate's Redis scoreboard stays
// the one authority on ESI spend. 30 runs/min per group with a burst
// capacity of 10 is far above normal load (a hot subject costs one run per
// cadence floor).
const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

// The engine's stored dataset union — a SUPERSET of the active registry while
// onlineStatus drains (drain-window pattern in docs/CONVEX.md): its schema
// literal + leftover rows outlive the deleted syncer so an in-flight run or a
// pre-deploy tab's heartbeat still validates. No syncRef is registered for it;
// isRegisteredDataset keeps every dispatch path off it, and the sweep's
// temporary retired-row GC drains the leftovers ahead of the wipe deploy.
const syncDatasetValidator = v.union(
  v.literal('onlineStatus'),
  v.literal('characterLocation'),
);

// The ACTIVE registry — one syncRef per registered dataset (SYNC_DATASETS).
const SYNC_REFS = {
  characterLocation: internal.characterLocationSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

// Pass C (abandoned-row GC) deletes at most this many past-retention subjects
// per sweep, oldest first, so a post-outage backlog can't blow the mutation's
// ~4,096 db.get/query budget — the next 15-min run drains the rest. Far above
// any healthy per-run retention-crossing count, and A+B's live working sets
// leave the shared budget comfortable.
const SWEEP_DELETE_BATCH = 512;

/**
 * The overdue/hot-set dispatch passes — the 30s scan and the sweep's Pass A and
 * Pass B — read at most this many subjects per run, oldest-first, so a large due
 * or hot set can't approach Convex's ~4,096 index-range-read per-mutation ceiling
 * (docs/CONVEX.md), the one capacity wall no tier lifts. A backlog drains over
 * subsequent runs (the scan's 30s tick, the sweep's 15-min run) — same posture as
 * Pass C's SWEEP_DELETE_BATCH. 1024 = 2× SWEEP_DELETE_BATCH and a 4× margin below
 * the ceiling; far above any realistic single-run set (the audit models ~0.021×
 * users due/tick → ~210 at 10k users, not reached until tens of thousands), so
 * normal operation stays single-run. Per-row cost against the ceiling is one
 * indexed presence/subject read — the dispatch path's rate-limiter call is
 * an isolated Convex component, billed against its own budget.
 */
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

/**
 * The liveness signal and the on-view trigger. Every beat refreshes presence
 * — written to the syncPresence row, a doc forViewer never reads, so an
 * interval beat no longer re-runs the heavy tracker payload (3.5.e1). Interval
 * beats stop at the presence write (the scan owns the cadence — letting them
 * dispatch would turn an errored subject into a 20s retry hammer) and so never
 * even touch the subject row. Mount/visible beats also dispatch immediately
 * when the data is stale or the viewer brought an unsynced character, which is
 * what makes opening a tracker (or returning to it) land a fresh sync at once
 * — and an errored run clears the cache window, so the next such beat retries
 * right away. The hint never grants access — the action re-enumerates the
 * user's characters from Neon on every run.
 */
export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
    // Whether the beating tab is visible. Optional and defaulting to true:
    // pre-field clients only ever beat while visible, so absence is honest.
    visible: v.optional(v.boolean()),
    // Per-tab lease. Optional so a pre-field client still beats; leave uses
    // it to ignore a close from a tab that is no longer the live beater.
    tabId: v.optional(v.string()),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason, visible, tabId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    // A retired dataset's beat (a tab loaded before its retirement deploy)
    // no-ops entirely — even writing presence would keep drain-GC rows alive.
    if (!isRegisteredDataset(dataset)) return;
    const userId = identity.subject;
    const now = Date.now();

    // Presence first, for every reason — into syncPresence, never the subject
    // row. This is the decoupling: a steady-state interval beat writes only
    // this doc and returns, so it cannot invalidate forViewer's read of
    // syncSubjects.
    const wasCold = await upsertPresence(
      ctx,
      dataset,
      userId,
      visible !== false,
      now,
      tabId,
    );

    // A RECOVERY interval beat falls through to the on-view path: hidden tabs
    // now beat too, so a ≥coldAfterMs gap (OS suspend, websocket outage,
    // freeze/thaw) can leave the subject retired by the scan while beats
    // resume with the tab still hidden — no visible beat ever comes to revive
    // it, and Pass B's 15-minute cron would be the only recovery. The first
    // beat after a cold gap re-arms/dispatches instead; steady-state interval
    // beats still stop at the presence write.
    if (reason === 'interval' && !wasCold) return;

    // Mount/visible only: the on-view dispatch path. Reads — and on the first
    // beat creates — the subject row. The client always fires a mount/visible
    // beat before starting its interval timer, so the row exists before any
    // interval beat arrives; intervals no longer create it.
    let subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) {
      const id = await ctx.db.insert('syncSubjects', newIdleSubject(dataset, userId));
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
        const { cadenceFloorMs } = SYNC_DATASET_CONFIG[dataset];
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

/**
 * The heartbeat's presence write. lastVisibleAt feeds the hidden-presence
 * backstop (a hidden beat advances only lastSeenAt); a fresh insert stamps it
 * unconditionally — a newly opened tab, even a background one, is a
 * deliberate user action and gets a fresh visibility budget. Returns whether
 * an EXISTING presence doc was cold for the dataset before this beat — the
 * recovery-beat signal the heartbeat uses to revive a subject the scan
 * retired during the gap (absent presence stays presence-only: the client
 * contract fires a mount beat first, which owns row creation).
 */
async function upsertPresence(
  ctx: MutationCtx,
  dataset: SyncDataset,
  userId: string,
  seenVisible: boolean,
  now: number,
  tabId: string | undefined,
): Promise<boolean> {
  const presence = await getPresence(ctx.db, dataset, userId);
  const wasCold =
    presence !== null && isCold(presence, SYNC_DATASET_CONFIG[dataset].coldAfterMs, now);
  const tabFields = tabId === undefined ? {} : { tabId };
  if (presence === null) {
    await ctx.db.insert('syncPresence', {
      dataset,
      userId,
      lastSeenAt: now,
      lastVisibleAt: now,
      ...tabFields,
    });
  } else {
    await ctx.db.patch(presence._id, {
      lastSeenAt: now,
      ...(seenVisible ? { lastVisibleAt: now } : {}),
      ...tabFields,
    });
  }
  return wasCold;
}

// Null the schedule so the row leaves the by_next_due range — a returning
// heartbeat revives a live dataset's row; the drain GC deletes a retired one.
async function retireFromScan(ctx: MutationCtx, subject: Doc<'syncSubjects'>): Promise<void> {
  await ctx.db.patch(subject._id, { nextDueAt: null });
  if (subject.dataset === 'characterLocation') {
    await clearCoverageForUser(ctx, subject.userId);
  }
}

/**
 * Tab-close leave: retire the location loop and hide pins when this tab is
 * still the live beater. A newer tabId (second Atlas tab, or a reload that
 * already mounted) is a no-op. Ages presence so a surviving tab's next
 * interval beat is a recovery beat. Crash / killed process still wait for
 * coldAfterMs — this path is best-effort.
 */
export const leave = internalMutation({
  args: {
    userId: v.string(),
    dataset: syncDatasetValidator,
    tabId: v.string(),
  },
  handler: async (ctx, { userId, dataset, tabId }) => {
    if (!isRegisteredDataset(dataset)) return { retired: false };
    const presence = await getPresence(ctx.db, dataset, userId);
    if (presence !== null && presence.tabId !== undefined && presence.tabId !== tabId) {
      return { retired: false };
    }
    const now = Date.now();
    if (presence !== null) {
      const coldAt = now - SYNC_DATASET_CONFIG[dataset].coldAfterMs - 1;
      await ctx.db.patch(presence._id, {
        lastSeenAt: coldAt,
        lastVisibleAt: coldAt,
      });
    }
    const subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject !== null) {
      await retireFromScan(ctx, subject);
    } else if (dataset === 'characterLocation') {
      await clearCoverageForUser(ctx, userId);
    }
    return { retired: true };
  },
});

/**
 * The 30s dispatcher (convex/crons.ts): one indexed range over due
 * subjects. Cold rows are retired from the scan set (nextDueAt null — the
 * returning viewer's heartbeat revives them); fresh-running rows are left
 * for their completion to re-arm; a running row past STALE_RUNNING_MS is
 * presumed wedged and taken over here, automatically.
 */
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
    // running-fresh cluster is bounded by STALE_RUNNING_MS. (Any cadence below
    // the 180s stale threshold — e.g. the ~60s offline-probe pace — lets a
    // still-running subject re-come-due before it ages out: exactly this
    // re-select-then-take-over case.)
    const due = await dueSubjects(ctx, now);
    for (const subject of due) {
      // A retired dataset's leftover row never dispatches (no syncRef exists)
      // — retire it from the scan set; the sweep GC deletes it.
      if (!isRegisteredDataset(subject.dataset)) {
        await retireFromScan(ctx, subject);
        continue;
      }
      // Presence is its own doc now (3.5.e1) — one point read per due row,
      // only over the hot, already-scheduled set. A missing doc reads as cold,
      // and each dataset is judged against its own cold window.
      const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
      if (isColdFromPresence(presence, SYNC_DATASET_CONFIG[subject.dataset].coldAfterMs, now)) {
        await retireFromScan(ctx, subject);
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      await dispatch(ctx, subject, now);
    }
    if (due.length === SCAN_DISPATCH_BATCH) logBatchCapped('engine:scan', 'scan_batch_capped', due.length);
  },
});

// Start one run for a subject: rate-limit per token group, schedule the
// dataset's sync action, mark the row running. lastRequestedAt is the
// generation token (a superseded run's late apply no-ops on it) and workId
// pairs the run with its completion (String(generation)). nextDueAt is parked
// one cadence out so the row stays in the scan set — a healthy completion
// overwrites it; a wedged run gets taken over by the scan after
// STALE_RUNNING_MS.
//
// Why a millisecond timestamp is a sound generation token despite the
// granularity (3.5.e3 verification): a SUPERSEDING dispatch overwrites
// lastRequestedAt only after isRunningFresh is false, which for a still-'running'
// row forces a ≥STALE_RUNNING_MS gap — so the new token can never equal the run
// it supersedes, and the old run's late apply no-ops on the mismatch. Concurrent
// same-subject dispatches are OCC-serialized on this row (the schedule and the
// patch below commit as ONE transaction), so exactly one run ever holds a given
// token; the loser re-runs, re-reads the now-'running' row, and isRunningFresh
// bails it. Load-bearing if refactoring: keep the schedule transactional with —
// and before — the patch; keep STALE_RUNNING_MS ≫ run duration; keep
// isRunningFresh inside the handler so it's re-checked on each OCC retry.
// Returns true iff a run was actually scheduled. A rate-limiter refusal parks
// nextDueAt and returns false WITHOUT scheduling — the sweep's `dispatched`
// counter (the watchdog's "is the Convex scan alive?" signal) must not count
// it, or a re-arm herd that the limiter smooths reads as a dead scan.
async function dispatch(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  now: number,
): Promise<boolean> {
  // Every caller pre-guards, but the stored union is wider than the registry
  // during a drain window — never index a missing syncRef.
  if (!isRegisteredDataset(subject.dataset)) return false;
  const { cadenceFloorMs, tokenGroup, rateKeyScope } = SYNC_DATASET_CONFIG[subject.dataset];
  // Default group key smooths re-arm herds across users; subject scope keeps
  // concurrent tracked pilots from starving each other on one char-location
  // bucket (characterLocation).
  const rateKey =
    rateKeyScope === 'subject' ? `${tokenGroup}:${subject.userId}` : tokenGroup;
  const { ok, retryAfter } = await rateLimiter.limit(ctx, 'syncDispatch', { key: rateKey });
  if (!ok) {
    await ctx.db.patch(subject._id, { nextDueAt: now + retryAfter });
    return false;
  }
  const workId = String(now);
  await ctx.scheduler.runAfter(0, SYNC_REFS[subject.dataset], {
    userId: subject.userId,
    generation: now,
  });
  await ctx.db.patch(subject._id, {
    status: 'running',
    lastRequestedAt: now,
    workId,
    nextDueAt: now + cadenceFloorMs,
  });
  return true;
}

/**
 * Per-subject hop scheduled by chain-on-success completions. Re-reads the
 * subject and calls dispatch only when idle, nextDueAt is reached, and
 * presence is still fresh — otherwise a no-op so takeover, generation, and
 * scan-retry semantics stay with the 30s scan.
 */
export const chainDispatch = internalMutation({
  args: {
    dataset: syncDatasetValidator,
    userId: v.string(),
  },
  handler: async (ctx, { dataset, userId }) => {
    if (!isRegisteredDataset(dataset)) return;
    const subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) return;
    const now = Date.now();
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return;
    if (subject.nextDueAt === null || subject.nextDueAt > now) return;
    const presence = await getPresence(ctx.db, dataset, userId);
    if (isColdFromPresence(presence, SYNC_DATASET_CONFIG[dataset].coldAfterMs, now)) return;
    await dispatch(ctx, subject, now);
  },
});

/**
 * A completed run's next-due decision, in precedence order: failed + fresh
 * presence → jitter-free floor hop (same instant on nextDueAt and chainAt so
 * the next poll does not wait for the 30s scan); failed + cold → jittered
 * floor re-arm with no hop (scan retires the row); synced nothing → park at
 * null until a heartbeat brings targets; chain-eligible (chainOnSuccess +
 * clean yield + fresh presence) → the jitter-free chain boundary with a
 * scheduled hop (jitter would land the hop later than its own due check and
 * silently degrade cadence to the 30s scan); otherwise → the jittered
 * cache-window re-arm. A zero-yield "success" — budget stop, all-reauth
 * roster, empty poll set — is chain-INELIGIBLE (no character covered cleanly
 * per the apply's stamp), so a protective state is never hammered at the 5s
 * floor.
 */
async function resolveCompletionSchedule(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  failed: boolean,
  cadenceFloorMs: number,
  coldAfterMs: number,
  chainOnSuccess: boolean,
  now: number,
): Promise<{ nextDueAt: number | null; chainAt: number | null }> {
  if (failed) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    if (!isColdFromPresence(presence, coldAfterMs, now)) {
      const boundary = now + cadenceFloorMs;
      return { nextDueAt: boundary, chainAt: boundary };
    }
    return { nextDueAt: computeNextDueAt(null, cadenceFloorMs, now), chainAt: null };
  }
  if (subject.syncedCharacterIds.length === 0) {
    return { nextDueAt: null, chainAt: null };
  }
  const yielded =
    subject.lastError === null && (subject.coveredCharacterIds?.length ?? 0) > 0;
  // A null window means some character's read errored (the #95 poisoned
  // stamp): computeChainBoundary(null, floor) would collapse the hop to the
  // cadence floor and hammer a partly-broken roster at 5s. Chain only off a
  // real window; a poisoned run falls to the jittered scan re-arm below
  // (~scan-tick pacing until the roster heals or the viewer relinks).
  if (chainOnSuccess && yielded && subject.minExpiresAt !== null) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    if (!isColdFromPresence(presence, coldAfterMs, now)) {
      const boundary = computeChainBoundary(subject.minExpiresAt, cadenceFloorMs, now);
      return { nextDueAt: boundary, chainAt: boundary };
    }
  }
  return {
    nextDueAt: computeNextDueAt(subject.minExpiresAt, cadenceFloorMs, now),
    chainAt: null,
  };
}

/**
 * Exactly-once run epilogue from the sync action: clear 'running', surface a
 * terminal failure, and arm the next due time per resolveCompletionSchedule,
 * scheduling the chainDispatch hop when one is due. Matched by workId, so a
 * taken-over run's late completion no-ops rather than clearing the new run's
 * status.
 */
export const onSyncComplete = internalMutation({
  args: {
    workId: v.string(),
    context: v.object({ dataset: syncDatasetValidator, userId: v.string() }),
    result: v.union(
      v.object({ kind: v.literal('success') }),
      v.object({ kind: v.literal('failed'), error: v.string() }),
    ),
  },
  handler: async (ctx, { workId, context, result }) => {
    // A retired dataset's late completion (in-flight across its retirement
    // deploy) has nothing to re-arm; the sweep GC deletes its row.
    if (!isRegisteredDataset(context.dataset)) return;
    const subject = await getSyncSubject(ctx.db, context.dataset, context.userId);
    if (subject === null || subject.workId !== workId) return;
    const now = Date.now();
    const { cadenceFloorMs, coldAfterMs, chainOnSuccess } = SYNC_DATASET_CONFIG[context.dataset];
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

    const { nextDueAt, chainAt } = await resolveCompletionSchedule(
      ctx,
      subject,
      failed,
      cadenceFloorMs,
      coldAfterMs,
      chainOnSuccess === true,
      now,
    );

    await ctx.db.patch(subject._id, {
      status: 'idle',
      workId: null,
      nextDueAt,
      // A terminal failure means the apply never ran, so the old cache
      // window is unverified — clear it (the #95 "errored, re-syncable now"
      // meaning) so the next mount/visible heartbeat dispatches immediately
      // instead of treating the stale window as fresh. A fresh-presence
      // failure also schedules the 5s hop; the scan is the backup.
      ...(failed
        ? { lastError: `sync_failed: ${result.error.slice(0, 500)}`, minExpiresAt: null }
        : {}),
    });

    if (chainAt !== null) {
      await ctx.scheduler.runAt(chainAt, internal.engine.chainDispatch, {
        dataset: subject.dataset,
        userId: subject.userId,
      });
    }
  },
});

/**
 * The external watchdog's worker (POST /sweep, convex/http.ts — driven by a
 * 15-minute Vercel cron, a different failure domain from the Convex
 * scheduler). Reconciles anything the 30s scan should have handled —
 * `dispatched` staying 0 on a healthy system is the idempotence signal, and
 * a non-zero count means the cron scan is dead or lagging. Also retires
 * cold due rows and deletes long-abandoned subjects (regenerable state: a
 * returning heartbeat recreates everything).
 *
 * Three bounded indexed passes, never a full-table scan (3.5.e2). Each reads
 * only the rows that can need action, so the work scales with live working
 * sets — not the total retained-subject count — and each is ALSO row-capped
 * (oldest-first .take()) so no pass can approach the ~4,096-read per-mutation
 * ceiling, draining any backlog over subsequent runs:
 *   A. overdue — by_next_due over (0, now], the 30s scan's own range: delete
 *      past-retention / retire cold-within-retention / dispatch hot. Capped at
 *      SCAN_DISPATCH_BATCH (≈0 on a healthy system, but the scan's own cap now
 *      lets a backlog form — this recovery pass must not read it unbounded).
 *   B. dropped — by_last_seen over presence within the widest cold window
 *      (lastSeenAt ≥ now−MAX_COLD_AFTER_MS, per-row filtered by each dataset's
 *      own window): a hot
 *      idle row with targets but no schedule (timer wiped mid-flight) is
 *      re-armed. Capped at SCAN_DISPATCH_BATCH (a backstop sample of the
 *      concurrently-watched set; the on-view heartbeat is the primary re-arm).
 *   C. abandoned — by_last_seen over past-retention presence (lastSeenAt \<
 *      now−RETENTION): delete subject + presence, oldest first, capped per run
 *      at SWEEP_DELETE_BATCH. Bounded by per-run retention crossings.
 * A runs first so its writes are visible (read-your-writes) to B/C: a row A
 * dispatched leaves the null-scheduled set B scans, and a row A deleted is gone
 * from C's presence range, so no row is acted on twice. The cold-but-within-
 * retention middle band is never scanned — it needs nothing until it comes due
 * (A) or ages out (C).
 * NOTE: a subject with NO presence doc sits in none of these ranges, so the
 * sweep does not delete it. Correct in steady state — presence and subject are
 * created together (heartbeat) and only ever deleted together (here), so no such
 * orphan is ever produced. The fixed pre-e1 legacy orphan population that
 * predated this coupling was reaped, and the lastSeenAt tombstone dropped, by the
 * e3 one-shot migration.
 */
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
    await sweepRetiredDatasets(ctx, counts);
    return counts;
  },
});

/**
 * TEMPORARY Pass D — the onlineStatus drain GC (delete alongside the wipe
 * deploy that drops the retired literals + characterOnline). Retention alone
 * would hold leftover rows for 7 days and block the wipe's schema push; this
 * drains them in a few 15-minute runs instead. The filtered take() guarantees
 * progress: each batch is up to RETIRED_GC_BATCH retired rows, never live
 * rows occupying slots (an unfiltered take would starve once live rows
 * outnumber the batch). The filter scans the table in creation order until it
 * finds the batch or the end — an unindexed scan bounded by table size
 * (~2 small rows/user, far under the 32k doc-scan ceiling) and acceptable
 * only because this pass is throwaway; there is deliberately no by_dataset
 * index. characterOnline teardown stays with its owner
 * (convex/onlineStatus.drainCharacterOnline).
 */
const RETIRED_GC_BATCH = 512;

/**
 * One batch of a dataset-keyed table's retired rows. The deny-list is the
 * ACTIVE registry, not a hardcoded literal — a dataset added to
 * `SYNC_DATASETS` while this temporary pass still exists must never have its
 * live rows swept.
 */
function takeRetiredRows(ctx: MutationCtx, table: 'syncSubjects' | 'syncPresence') {
  return ctx.db
    .query(table)
    .filter((q) => q.and(...SYNC_DATASETS.map((live) => q.neq(q.field('dataset'), live))))
    .take(RETIRED_GC_BATCH);
}

async function sweepRetiredDatasets(ctx: MutationCtx, counts: SweepCounts): Promise<void> {
  const subjects = await takeRetiredRows(ctx, 'syncSubjects');
  for (const row of subjects) {
    await ctx.db.delete(row._id);
    counts.deleted += 1;
  }
  const presence = await takeRetiredRows(ctx, 'syncPresence');
  for (const row of presence) await ctx.db.delete(row._id);
  await drainCharacterOnline(ctx, RETIRED_GC_BATCH);
}

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
    // Retired-dataset leftovers are the drain GC's province (Pass D).
    if (!isRegisteredDataset(subject.dataset)) {
      await retireFromScan(ctx, subject);
      counts.retired += 1;
      continue;
    }
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    switch (
      classifyDueSubject(
        presence,
        subject.status,
        subject.lastRequestedAt,
        SYNC_DATASET_CONFIG[subject.dataset].coldAfterMs,
        now,
      )
    ) {
      case 'delete':
        await ctx.db.delete(subject._id);
        if (presence !== null) await ctx.db.delete(presence._id);
        counts.deleted += 1;
        break;
      case 'retire':
        await retireFromScan(ctx, subject);
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
  // The range bound is the WIDEST registered cold window; each row is then
  // filtered by its own dataset's window (a narrower bound would silently
  // exclude longer-window datasets, and the range alone would treat a
  // short-window dataset's cold row as hot).
  const hot = await ctx.db
    .query('syncPresence')
    .withIndex('by_last_seen', (q) => q.gte('lastSeenAt', now - MAX_COLD_AFTER_MS))
    .take(SCAN_DISPATCH_BATCH);
  for (const presence of hot) {
    if (!isRegisteredDataset(presence.dataset)) continue;
    if (isColdFromPresence(presence, SYNC_DATASET_CONFIG[presence.dataset].coldAfterMs, now)) {
      continue;
    }
    const subject = await getSyncSubject(ctx.db, presence.dataset, presence.userId);
    if (subject !== null && droppedTimerReady(subject, now)) {
      if (await dispatch(ctx, subject, now)) counts.dispatched += 1;
    }
  }
  if (hot.length === SCAN_DISPATCH_BATCH) logBatchCapped('engine:sweep', 'dropped_batch_capped', hot.length);
}

// Pass B's subject-side shape: idle, unscheduled (Pass A owns anything with a
// nextDueAt), with targets and a lapsed window — the dropped-timer signature.
function droppedTimerReady(subject: Doc<'syncSubjects'>, now: number): boolean {
  if (subject.nextDueAt !== null) return false;
  if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return false;
  return (
    hasSyncTarget(subject.syncedCharacterIds, [])
    && isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, [], now)
  );
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
