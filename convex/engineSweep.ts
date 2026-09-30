import { v } from 'convex/values';
import {
  RETENTION_MS,
  LOCATION_COLD_AFTER_MS,
  isColdFromPresence,
  SYNC_DATASET_HISTORY,
  SYNC_DATASETS,
} from '@/lib/sync-engine';
import { internal } from './_generated/api';
import { internalMutation, type MutationCtx } from './_generated/server';
import { ensureLocationSync, getLocationSync, stopSync } from './lib/locationSchedule';
import { ensurePresenceExpiry } from './engine';
import { getPresence } from './lib/subjects';
import { clearCoverageForUser } from './lib/locationCoverage';
import { drainCharacterOnline } from './onlineStatus';

const SWEEP_DELETE_BATCH = 128;
const RETIRED_GC_BATCH = 128;

/**
 * Daily retention GC. Deletes presence (and its location sync state)
 * untouched for the retention window, and drains rows the location scheduler
 * no longer reads: every syncSubjects row, retired-dataset presence, and the
 * characterOnline table. A full batch schedules an immediate continuation so
 * a backlog drains in one pass.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const abandoned = await sweepAbandoned(ctx, now);
    const retired = await sweepRetiredRows(ctx);
    const deleted = abandoned.deleted + retired.deleted;
    const capped = abandoned.capped || retired.capped;
    if (capped) {
      await ctx.scheduler.runAfter(0, internal.engineSweep.sweep, {});
    }
    return { deleted, capped };
  },
});

const RETIRED_DATASETS = SYNC_DATASET_HISTORY.filter(
  (dataset) => !(SYNC_DATASETS as readonly string[]).includes(dataset),
);

async function sweepRetiredRows(
  ctx: MutationCtx,
): Promise<{ deleted: number; capped: boolean }> {
  const subjects = await ctx.db.query('syncSubjects').take(RETIRED_GC_BATCH);
  for (const row of subjects) {
    if (row.dataset === 'characterLocation') {
      const presence = await getPresence(ctx.db, 'characterLocation', row.userId);
      if (!isColdFromPresence(presence, LOCATION_COLD_AFTER_MS, Date.now())) {
        await ensureLocationSync(ctx, row.userId);
        await ensurePresenceExpiry(ctx, row.userId);
      } else {
        await clearCoverageForUser(ctx, row.userId);
      }
    }
    await ctx.db.delete('syncSubjects', row._id);
  }
  let presenceCount = 0;
  for (const dataset of RETIRED_DATASETS) {
    const rows = await ctx.db
      .query('syncPresence')
      .withIndex('by_dataset', (q) => q.eq('dataset', dataset))
      .take(RETIRED_GC_BATCH - presenceCount);
    for (const row of rows) await ctx.db.delete('syncPresence', row._id);
    presenceCount += rows.length;
    if (presenceCount >= RETIRED_GC_BATCH) break;
  }
  const online = await drainCharacterOnline(ctx, RETIRED_GC_BATCH);
  return {
    deleted: subjects.length,
    capped:
      subjects.length === RETIRED_GC_BATCH
      || presenceCount === RETIRED_GC_BATCH
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
    const state = presence.dataset === 'characterLocation'
      ? await getLocationSync(ctx.db, presence.userId)
      : null;
    if (state !== null) {
      await stopSync(ctx, state, now);
      await ctx.db.delete('locationSync', state._id);
      deleted += 1;
    }
    if (presence.dataset === 'characterLocation' && state === null) {
      await clearCoverageForUser(ctx, presence.userId);
    }
    await ctx.db.delete('syncPresence', presence._id);
  }
  return { deleted, capped: abandoned.length === SWEEP_DELETE_BATCH };
}
