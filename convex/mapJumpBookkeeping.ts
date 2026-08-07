// Map-scoped cleanup owner for the automatic-jump exactly-once stamps.
// Tracking revocation deliberately does not call this module: an
// untrack/retrack cycle must never erase a processed transition.
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/** Maximum jump-processing stamps deleted in one bounded teardown transaction. */
export const MAP_JUMP_BOOKKEEPING_PURGE_BATCH = 128;

/** Deletes one bounded map-scoped batch; the HTTP teardown door drains continuation. */
export const purgeForMap = internalMutation({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const rows = await ctx.db
      .query('mapJumpBookkeeping')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .take(MAP_JUMP_BOOKKEEPING_PURGE_BATCH + 1);
    const doomed = rows.slice(0, MAP_JUMP_BOOKKEEPING_PURGE_BATCH);
    for (const row of doomed) {
      await ctx.db.delete(row._id);
    }
    return {
      deleted: doomed.length,
      hasMore: rows.length > MAP_JUMP_BOOKKEEPING_PURGE_BATCH,
    };
  },
});
