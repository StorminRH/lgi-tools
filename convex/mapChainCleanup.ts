import { internalMutation, type MutationCtx } from './_generated/server';
import { isTombstoned } from '@/data/maps/chain-contract';
import { takeExpiredByPurgeAfter } from './lib/indexedQuery';

export const CHAIN_PURGE_BATCH = 128;

interface ChainPurgeResult {
  readonly deletedSystems: number;
  readonly deletedConnections: number;
  readonly retainedConnections: number;
  readonly deletedEvents: number;
  readonly hasMore: boolean;
}

async function endpointIsLive(
  ctx: MutationCtx,
  cache: Map<string, boolean>,
  mapId: string,
  systemId: number | null,
): Promise<boolean> {
  if (systemId === null) return false;
  const key = `${mapId}:${systemId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const endpoint = await ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) =>
      q.eq('mapId', mapId).eq('systemId', systemId),
    )
    .unique();
  const live = endpoint !== null && !isTombstoned(endpoint);
  cache.set(key, live);
  return live;
}

async function purgeExpiredChainTombstonesAt(
  ctx: MutationCtx,
  now: number,
): Promise<ChainPurgeResult> {
  const expiredSystems = await takeExpiredByPurgeAfter(
    ctx,
    'mapSystems',
    now,
    CHAIN_PURGE_BATCH + 1,
  );

  const systemsToDelete = expiredSystems.slice(0, CHAIN_PURGE_BATCH);
  for (const system of systemsToDelete) {
    await ctx.db.delete(system._id);
  }

  const expiredConnections = await takeExpiredByPurgeAfter(
    ctx,
    'mapConnections',
    now,
    CHAIN_PURGE_BATCH + 1,
  );

  const connectionsToProcess = expiredConnections.slice(0, CHAIN_PURGE_BATCH);
  const livenessCache = new Map<string, boolean>();
  let deletedConnections = 0;
  let retainedConnections = 0;
  for (const connection of connectionsToProcess) {
    const bothEndpointsLive =
      await endpointIsLive(ctx, livenessCache, connection.mapId, connection.fromSystemId)
      && await endpointIsLive(ctx, livenessCache, connection.mapId, connection.toSystemId);
    if (bothEndpointsLive) {
      if (connection.tombstone.kind === 'removed') {
        await ctx.db.patch(connection._id, {
          tombstone: { ...connection.tombstone, purgeAfter: null },
        });
      }
      retainedConnections += 1;
    } else {
      await ctx.db.delete(connection._id);
      deletedConnections += 1;
    }
  }

  const expiredEvents = await ctx.db
    .query('mapEvents')
    .withIndex('by_purge_after', (q) => q.lte('purgeAfter', now))
    .take(CHAIN_PURGE_BATCH + 1);
  const eventsToDelete = expiredEvents.slice(0, CHAIN_PURGE_BATCH);
  for (const event of eventsToDelete) {
    await ctx.db.delete(event._id);
  }

  return {
    deletedSystems: systemsToDelete.length,
    deletedConnections,
    retainedConnections,
    deletedEvents: eventsToDelete.length,
    hasMore:
      expiredSystems.length > systemsToDelete.length
      || expiredConnections.length > connectionsToProcess.length
      || expiredEvents.length > eventsToDelete.length,
  };
}

export const purgeExpiredChainTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredChainTombstonesAt(ctx, Date.now()),
});
