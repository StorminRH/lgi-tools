// The bounded expiry-only cleanup owner for reversible system and connection
// tombstones. Mirrors mapSignatureCleanup: one indexed range per table, a
// delete cap, and one look-ahead row so hasMore is exact. Active rows store
// null/undefined purgeAfter and can never enter the `> null` range.
import type { MutationCtx } from '../_generated/server';

/** Maximum tombstones one cleanup call deletes across both chain tables. */
export const CHAIN_PURGE_BATCH = 128;

/** The outcome of one bounded cleanup call, including exact continuation truth. */
export interface ChainPurgeResult {
  readonly deletedSystems: number;
  readonly deletedConnections: number;
  readonly hasMore: boolean;
}

/**
 * Deletes the oldest expired system and connection tombstones, up to
 * {@link CHAIN_PURGE_BATCH} total deletes per call.
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

  const connectionsToDelete = expiredConnections.slice(0, connectionBudget);
  for (const connection of connectionsToDelete) {
    await ctx.db.delete(connection._id);
  }

  return {
    deletedSystems: systemsToDelete.length,
    deletedConnections: connectionsToDelete.length,
    hasMore:
      expiredSystems.length > systemsToDelete.length
      || expiredConnections.length > connectionsToDelete.length,
  };
}
