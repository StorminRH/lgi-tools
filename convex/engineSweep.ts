import {
  classifyDueSubject,
  hasSyncTarget,
  isColdFromPresence,
  isRegisteredDataset,
  isRunningFresh,
  isStaleForImmediate,
  MAX_COLD_AFTER_MS,
  RETENTION_MS,
  SYNC_DATASET_CONFIG,
  SYNC_DATASETS,
} from '@/lib/sync-engine';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  dispatch,
  dueSubjects,
  logBatchCapped,
  retireFromScan,
  SCAN_DISPATCH_BATCH,
} from './lib/engineCore';
import { getPresence, getSyncSubject } from './lib/subjects';
import { drainCharacterOnline } from './onlineStatus';

const SWEEP_DELETE_BATCH = 512;
const RETIRED_GC_BATCH = 512;

interface SweepCounts {
  dispatched: number;
  retired: number;
  deleted: number;
}

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const counts: SweepCounts = { dispatched: 0, retired: 0, deleted: 0 };
    await sweepOverdue(ctx, now, counts);
    await sweepDropped(ctx, now, counts);
    await sweepAbandoned(ctx, now, counts);
    await sweepRetiredDatasets(ctx, counts);
    return counts;
  },
});

// Temporary drain GC: unindexed on purpose — no by_dataset index, throwaway
// ahead of the wipe deploy.
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

async function sweepOverdue(ctx: MutationCtx, now: number, counts: SweepCounts): Promise<void> {
  const due = await dueSubjects(ctx, now);
  for (const subject of due) {
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
  if (due.length === SCAN_DISPATCH_BATCH) {
    logBatchCapped('engine:sweep', 'overdue_batch_capped', due.length);
  }
}

async function sweepDropped(ctx: MutationCtx, now: number, counts: SweepCounts): Promise<void> {
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
  if (hot.length === SCAN_DISPATCH_BATCH) {
    logBatchCapped('engine:sweep', 'dropped_batch_capped', hot.length);
  }
}

function droppedTimerReady(subject: Doc<'syncSubjects'>, now: number): boolean {
  if (subject.nextDueAt !== null) return false;
  if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return false;
  return (
    hasSyncTarget(subject.syncedCharacterIds, [])
    && isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, [], now)
  );
}

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
    console.warn(
      JSON.stringify({
        scope: 'engine:sweep',
        note: 'retention_batch_capped',
        deletedThisRun: counts.deleted,
      }),
    );
  }
}
