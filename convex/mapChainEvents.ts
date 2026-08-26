import { v } from 'convex/values';
import { query } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';

/** Maximum retained ledger rows one live map subscription may read. */
export const MAP_EVENT_READ_LIMIT = 100;

/**
 * Watches the retained basic ledger newest-first through one bounded map/time
 * index range. Access denial is the same calm empty value as the chain pages.
 */
export const watchMapEvents = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return [];
    return await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .order('desc')
      .take(MAP_EVENT_READ_LIMIT);
  },
});
