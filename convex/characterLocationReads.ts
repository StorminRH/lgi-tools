import { v } from 'convex/values';
import { internalQuery } from './_generated/server';

export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const locations = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const online = await ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      locations: locations.map((doc) => ({
        characterId: doc.characterId,
        solarSystemId: doc.solarSystemId,
        etagLocation: doc.etagLocation,
        etagShip: doc.etagShip,
      })),
      online: online.map((doc) => ({
        characterId: doc.characterId,
        online: doc.online,
        etagOnline: doc.etagOnline,
        onlineExpiresAt: doc.onlineExpiresAt,
      })),
    };
  },
});
