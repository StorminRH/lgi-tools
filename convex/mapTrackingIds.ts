import { v } from 'convex/values';
import { internalQuery } from './_generated/server';

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
