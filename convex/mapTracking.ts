// Per-(map, character) tracking opt-in — the registry half of 4.0.4.2.1 tracked
// location. Live map state, not chain: rows live only here, viewers join through
// forMap to characterLocation by the row's own (userId, characterId), and
// revocation/map teardown cascade-delete inside mapAccessProjection.
//
// Ownership is structural: setTracking always writes under the caller's JWT
// subject, and the sync action (OW3) enumerates/vends tokens only for the
// caller's characters. A forged tracking row naming someone else's character
// joins to no location document.
import { v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
import { requireMapAccess, tryMapAccess } from './lib/mapAccess';

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

/**
 * Opt a character into or out of tracking on one map. Requires a view claim;
 * the row's userId is always the caller's JWT subject. tracked=true upserts;
 * tracked=false deletes. Idempotent either way.
 */
export const setTracking = mutation({
  args: {
    mapId: v.string(),
    characterId: v.number(),
    tracked: v.boolean(),
  },
  handler: async (ctx, { mapId, characterId, tracked }) => {
    const principal = await requireMapAccess(ctx, mapId, 'view');
    const existing = await ctx.db
      .query('mapTracking')
      .withIndex('by_map_user', (q) =>
        q.eq('mapId', mapId).eq('userId', principal.userId),
      )
      .collect();
    const match = existing.find((row) => row.characterId === characterId);

    if (tracked) {
      if (match === undefined) {
        await ctx.db.insert('mapTracking', {
          mapId,
          userId: principal.userId,
          characterId,
        });
      }
      return { tracked: true };
    }

    if (match !== undefined) {
      await ctx.db.delete(match._id);
    }
    return { tracked: false };
  },
});

/**
 * Tracking rows for one map, joined to location by each row's own
 * (userId, characterId). Access is answered as a value: missing/revoked claim
 * returns an empty list (4.0.2.3.1 subscription doctrine). A forged row that
 * names another user's character joins to no document and discloses nothing.
 */
export const forMap = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) {
      return { tracked: [] as const };
    }

    const rows = await ctx.db
      .query('mapTracking')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .collect();

    const tracked = [];
    for (const row of rows) {
      const location = await ctx.db
        .query('characterLocation')
        .withIndex('by_user_character', (q) =>
          q.eq('userId', row.userId).eq('characterId', row.characterId),
        )
        .unique();
      tracked.push({
        userId: row.userId,
        characterId: row.characterId,
        location:
          location === null
            ? null
            : {
                solarSystemId: location.solarSystemId,
                stationId: location.stationId,
                structureId: location.structureId,
                shipTypeId: location.shipTypeId,
                prevSolarSystemId: location.prevSolarSystemId,
                prevFresh: location.prevFresh,
                observedAt: location.observedAt,
              },
      });
    }
    return { tracked };
  },
});
