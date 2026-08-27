import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalQuery, query } from './_generated/server';
import { collectByUser, viewerUserDocs } from './lib/indexedQuery';

function viewerLocation(doc: Doc<'characterLocation'>) {
  return {
    characterId: doc.characterId,
    solarSystemId: doc.solarSystemId,
    stationId: doc.stationId,
    structureId: doc.structureId,
    shipTypeId: doc.shipTypeId,
    prevSolarSystemId: doc.prevSolarSystemId,
    prevFresh: doc.prevFresh,
    transitionObservedAt: doc.transitionObservedAt ?? null,
    observedAt: doc.observedAt,
  };
}

export const forViewer = query({
  args: {},
  handler: async (ctx) =>
    viewerUserDocs(
      ctx,
      (userId) => collectByUser(ctx, 'characterLocation', userId),
      viewerLocation,
    ),
});

/**
 * The action's read seam: which ETags to replay per character for the
 * conditional location and ship reads, plus the held online-probe state
 * (flag, ETag, cache window). ONE internalQuery — both tables read in the
 * same transaction, so the etag-beside-value invariants hold across a single
 * snapshot (two runQuery calls would each get their own).
 */
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
