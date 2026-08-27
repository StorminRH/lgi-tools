import { internalMutation } from './_generated/server';
import { purgeScopeArgs } from './lib/syncFields';

export const purgeForUser = internalMutation({
  args: purgeScopeArgs,
  handler: async (ctx, { userId, characterId }) => {
    const locations = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) => {
        const byUser = q.eq('userId', userId);
        return characterId === null ? byUser : byUser.eq('characterId', characterId);
      })
      .collect();
    const heldOnline = await ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user_character', (q) => {
        const byUser = q.eq('userId', userId);
        return characterId === null ? byUser : byUser.eq('characterId', characterId);
      })
      .collect();
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) => {
        const byUser = q.eq('userId', userId);
        return characterId === null ? byUser : byUser.eq('characterId', characterId);
      })
      .collect();
    const accessLeases = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) => {
        const byUser = q.eq('userId', userId);
        return characterId === null ? byUser : byUser.eq('characterId', characterId);
      })
      .collect();
    const covered = await ctx.db
      .query('characterLocationCovered')
      .withIndex('by_user_character', (q) => {
        const byUser = q.eq('userId', userId);
        return characterId === null ? byUser : byUser.eq('characterId', characterId);
      })
      .collect();

    for (const doc of locations) await ctx.db.delete(doc._id);
    for (const doc of heldOnline) await ctx.db.delete(doc._id);
    for (const doc of tracking) await ctx.db.delete(doc._id);
    for (const doc of accessLeases) await ctx.db.delete(doc._id);
    for (const doc of covered) await ctx.db.delete(doc._id);

    const stampCharacterIds =
      characterId !== null
        ? [characterId]
        : [
            ...new Set(
              [...locations, ...tracking].map((doc) => doc.characterId),
            ),
          ];
    let deletedBookkeeping = 0;
    for (const stampCharacterId of stampCharacterIds) {
      const stamps = await ctx.db
        .query('mapJumpBookkeeping')
        .withIndex('by_character', (q) =>
          q.eq('characterId', stampCharacterId),
        )
        .collect();
      for (const doc of stamps) {
        await ctx.db.delete(doc._id);
        deletedBookkeeping += 1;
      }
    }
    return {
      deletedLocations: locations.length,
      deletedTracking: tracking.length,
      deletedBookkeeping,
    };
  },
});
