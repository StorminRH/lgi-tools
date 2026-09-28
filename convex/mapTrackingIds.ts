import { collectByUser } from './lib/indexedQuery';
import { v } from 'convex/values';
import { internalQuery } from './_generated/server';

export const trackedCharacterIds = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await collectByUser(ctx.db, 'mapTracking', userId);
    return [...new Set(rows.map((row) => row.characterId))];
  },
});
