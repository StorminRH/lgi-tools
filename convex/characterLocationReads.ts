import { v } from 'convex/values';
import { internalQuery, type QueryCtx } from './_generated/server';

const locationSnapshotValidator = v.object({
  characterId: v.number(),
  solarSystemId: v.union(v.number(), v.null()),
  etagLocation: v.union(v.string(), v.null()),
  etagShip: v.union(v.string(), v.null()),
});

const onlineSnapshotValidator = v.object({
  characterId: v.number(),
  online: v.boolean(),
  etagOnline: v.union(v.string(), v.null()),
  onlineExpiresAt: v.number(),
});

const leaseSnapshotValidator = v.object({
  characterId: v.number(),
  accessToken: v.string(),
  expiresAt: v.number(),
});

const prepIoValidator = v.object({
  bytesRead: v.number(),
  documentsRead: v.number(),
  databaseQueries: v.number(),
});

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
      locations: locations.map(toLocationSnapshot),
      online: online.map(toOnlineSnapshot),
    };
  },
});

export const prepareLocationSync = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    trackedIds: v.array(v.number()),
    locations: v.array(locationSnapshotValidator),
    online: v.array(onlineSnapshotValidator),
    leases: v.array(leaseSnapshotValidator),
    io: prepIoValidator,
  }),
  handler: async (ctx, { userId }) => {
    const trackingRows = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) => q.eq('userId', userId))
      .collect();
    const trackedIds = [...new Set(trackingRows.map((row) => row.characterId))];
    if (trackedIds.length === 0) {
      return {
        trackedIds,
        locations: [],
        online: [],
        leases: [],
        io: await readPrepIo(ctx),
      };
    }

    const tracked = new Set(trackedIds);
    const locations = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const online = await ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const leases = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      trackedIds,
      locations: locations.filter((doc) => tracked.has(doc.characterId)).map(toLocationSnapshot),
      online: online.filter((doc) => tracked.has(doc.characterId)).map(toOnlineSnapshot),
      leases: leases
        .filter((doc) => tracked.has(doc.characterId))
        .map((doc) => ({
          characterId: doc.characterId,
          accessToken: doc.accessToken,
          expiresAt: doc.expiresAt,
        })),
      io: await readPrepIo(ctx),
    };
  },
});

function toLocationSnapshot(doc: {
  characterId: number;
  solarSystemId: number | null;
  etagLocation: string | null;
  etagShip: string | null;
}) {
  return {
    characterId: doc.characterId,
    solarSystemId: doc.solarSystemId,
    etagLocation: doc.etagLocation,
    etagShip: doc.etagShip,
  };
}

function toOnlineSnapshot(doc: {
  characterId: number;
  online: boolean;
  etagOnline: string | null;
  onlineExpiresAt: number;
}) {
  return {
    characterId: doc.characterId,
    online: doc.online,
    etagOnline: doc.etagOnline,
    onlineExpiresAt: doc.onlineExpiresAt,
  };
}

async function readPrepIo(ctx: QueryCtx) {
  const metrics = await ctx.meta.getTransactionMetrics();
  return {
    bytesRead: metrics.bytesRead.used,
    documentsRead: metrics.documentsRead.used,
    databaseQueries: metrics.databaseQueries.used,
  };
}
