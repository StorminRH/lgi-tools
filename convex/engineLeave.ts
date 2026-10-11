import { v } from 'convex/values';
import { LOCATION_COLD_AFTER_MS } from '@/lib/sync-engine';
import { internalMutation } from './_generated/server';
import { retireLocationSync } from './lib/locationSchedule';
import { getLocationPresence } from './lib/subjects';

export const leave = internalMutation({
  args: {
    userId: v.string(),
    dataset: v.literal('characterLocation'),
    tabId: v.string(),
  },
  handler: async (ctx, { userId, tabId }) => {
    const presence = await getLocationPresence(ctx.db, userId);
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
    await retireLocationSync(ctx, userId, now);
    return { retired: true };
  },
});
