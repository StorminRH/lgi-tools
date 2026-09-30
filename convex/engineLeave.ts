import { v } from 'convex/values';
import { LOCATION_COLD_AFTER_MS } from '@/lib/sync-engine';
import { internalMutation } from './_generated/server';
import { clearCoverageForUser } from './lib/locationCoverage';
import { getLocationSync, stopSync } from './lib/locationSchedule';
import { getPresence } from './lib/subjects';

export const leave = internalMutation({
  args: {
    userId: v.string(),
    dataset: v.literal('characterLocation'),
    tabId: v.string(),
  },
  handler: async (ctx, { userId, tabId }) => {
    const presence = await getPresence(ctx.db, 'characterLocation', userId);
    if (presence !== null && presence.tabId !== undefined && presence.tabId !== tabId) {
      return { retired: false };
    }
    const now = Date.now();
    if (presence !== null) {
      const coldAt = now - LOCATION_COLD_AFTER_MS - 1;
      await ctx.db.patch('syncPresence', presence._id, {
        lastSeenAt: coldAt,
        lastVisibleAt: coldAt,
        leftTabId: tabId,
      });
    }
    const state = await getLocationSync(ctx.db, userId);
    if (state !== null) {
      await stopSync(ctx, state, now);
    } else {
      await clearCoverageForUser(ctx, userId);
    }
    return { retired: true };
  },
});
