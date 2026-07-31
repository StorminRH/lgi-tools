import type { MutationCtx } from '../_generated/server';

const MAP_SIGNATURE_CLEANUP_BATCH = 128;

/**
 * Deletes one bounded oldest-first expiry batch. Tombstoning already removed
 * activity companions, so cleanup performs no per-row lookup or N+1 join.
 */
export async function purgeExpiredSignatureTombstones(
  ctx: MutationCtx,
  now: number,
): Promise<{ deletedCount: number; hasMore: boolean }> {
  const rows = await ctx.db
    .query('mapSignatures')
    .withIndex('by_purge_after', (q) =>
      q.gt('purgeAfter', null).lte('purgeAfter', now),
    )
    .take(MAP_SIGNATURE_CLEANUP_BATCH + 1);
  const batch = rows.slice(0, MAP_SIGNATURE_CLEANUP_BATCH);
  for (const row of batch) await ctx.db.delete(row._id);
  return {
    deletedCount: batch.length,
    hasMore: rows.length > MAP_SIGNATURE_CLEANUP_BATCH,
  };
}
