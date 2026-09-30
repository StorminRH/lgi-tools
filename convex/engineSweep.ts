import {
  isRegisteredDataset,
  RETENTION_MS,
  SYNC_DATASET_HISTORY,
} from '@/lib/sync-engine';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { getSyncSubject } from './lib/subjects';
import { drainCharacterOnline } from './onlineStatus';

const SWEEP_DELETE_BATCH = 512;
const RETIRED_GC_BATCH = 512;

/**
 * Daily retention GC. Deletes presence (and its subject) untouched for the
 * retention window, and drains rows left by retired datasets. A full batch
 * schedules an immediate continuation so a backlog drains in one pass.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const abandoned = await sweepAbandoned(ctx, now);
    const retired = await sweepRetiredDatasets(ctx);
    const deleted = abandoned.deleted + retired.deleted;
    const capped = abandoned.capped || retired.capped;
    if (capped) {
      await ctx.scheduler.runAfter(0, internal.engineSweep.sweep, {});
    }
    return { deleted, capped };
  },
});

const RETIRED_DATASETS = SYNC_DATASET_HISTORY.filter((dataset) => !isRegisteredDataset(dataset));

async function takeRetiredRows(ctx: MutationCtx, table: 'syncSubjects' | 'syncPresence') {
  const rows: Doc<typeof table>[] = [];
  for (const dataset of RETIRED_DATASETS) {
    const remaining: number = RETIRED_GC_BATCH - rows.length;
    if (remaining <= 0) break;
    rows.push(...await ctx.db
      .query(table)
      .withIndex('by_dataset', (q) => q.eq('dataset', dataset))
      .take(remaining));
  }
  return rows;
}

async function sweepRetiredDatasets(
  ctx: MutationCtx,
): Promise<{ deleted: number; capped: boolean }> {
  const subjects = await takeRetiredRows(ctx, 'syncSubjects');
  for (const row of subjects) await ctx.db.delete(row._id);
  const presence = await takeRetiredRows(ctx, 'syncPresence');
  for (const row of presence) await ctx.db.delete(row._id);
  const online = await drainCharacterOnline(ctx, RETIRED_GC_BATCH);
  return {
    deleted: subjects.length,
    capped:
      subjects.length === RETIRED_GC_BATCH
      || presence.length === RETIRED_GC_BATCH
      || online === RETIRED_GC_BATCH,
  };
}

async function sweepAbandoned(
  ctx: MutationCtx,
  now: number,
): Promise<{ deleted: number; capped: boolean }> {
  const abandoned = await ctx.db
    .query('syncPresence')
    .withIndex('by_last_seen', (q) => q.lt('lastSeenAt', now - RETENTION_MS))
    .take(SWEEP_DELETE_BATCH);
  let deleted = 0;
  for (const presence of abandoned) {
    const subject = await getSyncSubject(ctx.db, presence.dataset, presence.userId);
    if (subject !== null) {
      await ctx.db.delete(subject._id);
      deleted += 1;
    }
    await ctx.db.delete(presence._id);
  }
  return { deleted, capped: abandoned.length === SWEEP_DELETE_BATCH };
}
