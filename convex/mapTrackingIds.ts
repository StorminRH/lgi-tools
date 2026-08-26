import { v } from 'convex/values';
import { internalQuery } from './_generated/server';

/**
 * Distinct character ids the user currently tracks on any map — the sync
 * action's poll-set half (intersected with Neon enumeration + eligibility).
 */
export const trackedCharacterIds = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) => q.eq('userId', userId))
      .collect();
    return [...new Set(rows.map((row) => row.characterId))];
  },
});
