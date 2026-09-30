import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import type { Doc } from './_generated/dataModel';

/**
 * Everything one location run reads before calling ESI, in one query. It only
 * excludes per-run scheduling and presence rows. Reads are restricted to
 * currently tracked characters, so leftover state neither costs reads nor
 * invalidates this cache. Probe or location changes still invalidate it.
 */
export const syncInputs = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    trackedIds: v.array(v.number()),
    locations: v.array(v.object({ characterId: v.number(), solarSystemId: v.number(),
      etagLocation: v.union(v.string(), v.null()), etagShip: v.union(v.string(), v.null()) })),
    online: v.array(v.object({ characterId: v.number(), online: v.boolean(),
      etagOnline: v.union(v.string(), v.null()), onlineExpiresAt: v.number() })),
    leases: v.array(v.object({ characterId: v.number(), accessToken: v.string(), expiresAt: v.number() })),
  }),
  handler: async (ctx, { userId }) => {
    const trackedIds: number[] = [];
    while (true) {
      const previous = trackedIds.at(-1);
      // Seek past this pilot's memberships instead of reading each map copy.
      const tracking = await ctx.db.query('mapTracking')
        .withIndex('by_user_character', (q) => {
          const user = q.eq('userId', userId);
          return previous === undefined ? user : user.gt('characterId', previous);
        })
        .first();
      if (tracking === null) break;
      trackedIds.push(tracking.characterId);
    }
    if (trackedIds.length === 0) {
      return { trackedIds, locations: [], online: [], leases: [] };
    }
    const locations: Doc<'characterLocation'>[] = [];
    const online: Doc<'characterLocationOnline'>[] = [];
    const leases: Doc<'characterLocationAccess'>[] = [];
    for (const characterId of trackedIds) {
      const [location, probe, lease] = await Promise.all([
        ctx.db.query('characterLocation').withIndex('by_user_character', (q) =>
          q.eq('userId', userId).eq('characterId', characterId)).unique(),
        ctx.db.query('characterLocationOnline').withIndex('by_user_character', (q) =>
          q.eq('userId', userId).eq('characterId', characterId)).unique(),
        ctx.db.query('characterLocationAccess').withIndex('by_user_character', (q) =>
          q.eq('userId', userId).eq('characterId', characterId)).unique(),
      ]);
      if (location !== null) locations.push(location);
      if (probe !== null) online.push(probe);
      if (lease !== null) leases.push(lease);
    }
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
