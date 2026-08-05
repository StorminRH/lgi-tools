// Character location payload + account/character purge door for 4.0.4.2.1.
//
// The sync action, held-state query, and generation-guarded apply land in OW3;
// this module owns the table's explicit teardown so a Neon-side account or
// character purge can empty characterLocation and mapTracking when no later
// sync would orphan-clean a removed account. Reached only via the bearer-gated
// POST /purge-location-tracking HTTP action.
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/**
 * Explicit teardown for a Neon-side account/character purge. characterId null
 * tears down the whole user (account-nuke): every characterLocation doc and
 * every mapTracking row for that user. A number tears down one character.
 * Idempotent: deleting absent rows is a no-op.
 */
export const purgeForUser = internalMutation({
  args: { userId: v.string(), characterId: v.union(v.number(), v.null()) },
  handler: async (ctx, { userId, characterId }) => {
    const locations =
      characterId === null
        ? await ctx.db
            .query('characterLocation')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect()
        : await ctx.db
            .query('characterLocation')
            .withIndex('by_user_character', (q) =>
              q.eq('userId', userId).eq('characterId', characterId),
            )
            .collect();

    const tracking =
      characterId === null
        ? await ctx.db
            .query('mapTracking')
            .withIndex('by_user_character', (q) => q.eq('userId', userId))
            .collect()
        : await ctx.db
            .query('mapTracking')
            .withIndex('by_user_character', (q) =>
              q.eq('userId', userId).eq('characterId', characterId),
            )
            .collect();

    for (const doc of locations) await ctx.db.delete(doc._id);
    for (const doc of tracking) await ctx.db.delete(doc._id);
    return {
      deletedLocations: locations.length,
      deletedTracking: tracking.length,
    };
  },
});
