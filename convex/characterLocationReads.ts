import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { collectByUser } from './lib/indexedQuery';

/**
 * Everything one location run reads before calling ESI, in one query. It only
 * reads rows that change rarely (tracking, held location/probe, access
 * leases) and never the per-run locationSync or presence rows, so between
 * probe updates Convex serves it from the query cache.
 */
export const syncInputs = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const tracking = await collectByUser(ctx.db, 'mapTracking', userId);
    const trackedIds = [...new Set(tracking.map((row) => row.characterId))];
    if (trackedIds.length === 0) {
      return { trackedIds, locations: [], online: [], leases: [] };
    }
    const locations = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) => q.eq('userId', userId))
      .collect();
    const online = await ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user_character', (q) => q.eq('userId', userId))
      .collect();
    const leases = await collectByUser(ctx.db, 'characterLocationAccess', userId);
    return {
      trackedIds,
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
      leases: leases.map((row) => ({
        characterId: row.characterId,
        accessToken: row.accessToken,
        expiresAt: row.expiresAt,
      })),
    };
  },
});
