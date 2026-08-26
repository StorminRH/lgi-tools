// Tab-close leave: retire the location loop when this tab is still the live
// beater. A newer tabId is a no-op. Crash / killed process still wait for
// coldAfterMs.
import { v } from 'convex/values';
import { isRegisteredDataset, SYNC_DATASET_CONFIG } from '@/lib/sync-engine';
import { internalMutation } from './_generated/server';
import { retireFromScan, syncDatasetValidator } from './lib/engineCore';
import { clearCoverageForUser } from './lib/locationCoverage';
import { getPresence, getSyncSubject } from './lib/subjects';

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
        leftTabId: tabId,
      });
    }
    const subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject !== null) {
      await ctx.db.patch(subject._id, {
        lastRequestedAt: 0,
        workId: null,
      });
      await retireFromScan(ctx, subject);
    } else if (dataset === 'characterLocation') {
      await clearCoverageForUser(ctx, userId);
    }
    return { retired: true };
  },
});
