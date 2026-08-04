// The bounded expiry-only cleanup owner for reversible system/connection
// tombstones and retained map events. One shared processing cap and a
// look-ahead row per table keep writes bounded and hasMore exact. Active rows
// store null/undefined purgeAfter and can never enter the `> null` range.
import type { MutationCtx } from '../_generated/server';
import { isTombstoned } from '@/data/maps/chain-contract';

/** Maximum rows one cleanup call processes across chain tables and events. */
export const CHAIN_PURGE_BATCH = 128;

/** The outcome of one bounded cleanup call, including exact continuation truth. */
export interface ChainPurgeResult {
  readonly deletedSystems: number;
  readonly deletedConnections: number;
  readonly retainedConnections: number;
  readonly deletedEvents: number;
  readonly hasMore: boolean;
}

async function endpointIsLive(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<boolean> {
  const endpoint = await ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) =>
      q.eq('mapId', mapId).eq('systemId', systemId),
    )
    .unique();
  return endpoint !== null && !isTombstoned(endpoint);
}

/**
 * Processes the oldest expired system tombstones, connection tombstones, and
 * map events, up to {@link CHAIN_PURGE_BATCH} total rows per call. A connection
 * whose two endpoints are still live becomes a permanent skeleton by clearing
 * `purgeAfter`; a dangling connection is hard-deleted.
 *
 * Each table is ranged as `purgeAfter > null && purgeAfter <= now`. Convex
 * orders null below every number, so an ACTIVE row cannot enter the range.
 * One row past each table's remaining budget makes `hasMore` exact.
 */
export async function purgeExpiredChainTombstones(
  ctx: MutationCtx,
  now: number,
): Promise<ChainPurgeResult> {
  const systemBudget = CHAIN_PURGE_BATCH;
  const expiredSystems = await ctx.db
    .query('mapSystems')
    .withIndex('by_purge_after', (q) => q.gt('purgeAfter', null).lte('purgeAfter', now))
    .take(systemBudget + 1);

  const systemsToDelete = expiredSystems.slice(0, systemBudget);
  for (const system of systemsToDelete) {
    await ctx.db.delete(system._id);
  }

  const connectionBudget = CHAIN_PURGE_BATCH - systemsToDelete.length;
  const expiredConnections = await ctx.db
    .query('mapConnections')
    .withIndex('by_purge_after', (q) => q.gt('purgeAfter', null).lte('purgeAfter', now))
    .take(connectionBudget + 1);

  const connectionsToProcess = expiredConnections.slice(0, connectionBudget);
  let deletedConnections = 0;
  let retainedConnections = 0;
  for (const connection of connectionsToProcess) {
    const bothEndpointsLive =
      await endpointIsLive(ctx, connection.mapId, connection.fromSystemId)
      && await endpointIsLive(ctx, connection.mapId, connection.toSystemId);
    if (bothEndpointsLive) {
      await ctx.db.patch(connection._id, { purgeAfter: null });
      retainedConnections += 1;
    } else {
      await ctx.db.delete(connection._id);
      deletedConnections += 1;
    }
  }

  const eventBudget = connectionBudget - connectionsToProcess.length;
  const expiredEvents = await ctx.db
    .query('mapEvents')
    .withIndex('by_purge_after', (q) => q.lte('purgeAfter', now))
    .take(eventBudget + 1);
  const eventsToDelete = expiredEvents.slice(0, eventBudget);
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
