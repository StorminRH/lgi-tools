// 30s due-set dispatcher (convex/crons.ts). Cold rows leave the scan set;
// fresh-running rows wait for completion; a running row past STALE_RUNNING_MS
// is taken over here.
import {
  isColdFromPresence,
  isRegisteredDataset,
  isRunningFresh,
  SYNC_DATASET_CONFIG,
} from '@/lib/sync-engine';
import { internalMutation } from './_generated/server';
import {
  dispatch,
  dueSubjects,
  logBatchCapped,
  retireFromScan,
  SCAN_DISPATCH_BATCH,
} from './lib/engineCore';
import { getPresence } from './lib/subjects';

export const scan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await dueSubjects(ctx, now);
    for (const subject of due) {
      if (!isRegisteredDataset(subject.dataset)) {
        await retireFromScan(ctx, subject);
        continue;
      }
      const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
      if (isColdFromPresence(presence, SYNC_DATASET_CONFIG[subject.dataset].coldAfterMs, now)) {
        await retireFromScan(ctx, subject);
        continue;
      }
      if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) continue;
      await dispatch(ctx, subject, now);
    }
    if (due.length === SCAN_DISPATCH_BATCH) {
      logBatchCapped('engine:scan', 'scan_batch_capped', due.length);
    }
  },
});
