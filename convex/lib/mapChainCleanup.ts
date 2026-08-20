// The bounded expiry-only cleanup owner for reversible system/connection
// tombstones and retained map events. A per-table processing cap and a
// look-ahead row per table keep writes bounded, hasMore exact, and every
// nonempty queue progressing each call — a sustained backlog in one table can
// never starve the others. Active rows store null/undefined purgeAfter and can
// never enter the `> null` range.
import type { MutationCtx } from '../_generated/server';
import { isTombstoned } from '@/data/maps/chain-contract';
import { takeExpiredByPurgeAfter } from './indexedQuery';

/** Maximum rows one cleanup call processes per table (systems, connections, events). */
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

/**
 * Processes the oldest expired system tombstones, connection tombstones, and
 * map events, up to {@link CHAIN_PURGE_BATCH} rows per table per call. A
 * connection whose two endpoints are still live becomes a permanent skeleton by
 * clearing `purgeAfter`; a dangling connection is hard-deleted.
 *
 * Each table is ranged as `purgeAfter > null && purgeAfter <= now`. Convex
 * orders null below every number, so an ACTIVE row cannot enter the range.
 * One row past each table's budget makes `hasMore` exact. Endpoint liveness is
 * memoized per call, after this call's own system deletions.
 */
export async function purgeExpiredChainTombstones(
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
      await ctx.db.patch(connection._id, { purgeAfter: null });
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
