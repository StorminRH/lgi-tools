import type { MutationCtx } from '../_generated/server';

/** Maximum expired signature tombstones deleted by one cleanup call. */
export const SIGNATURE_TOMBSTONE_DELETE_CAP = 128;

/**
 * Deletes the oldest expired signature tombstones up to the fixed cap and reports
 * exact continuation truth. Owns the single indexed `mapSignatures` look-ahead
 * read; performs no activity companion lookup and no `db.get`.
 */
export async function purgeExpiredSignatureTombstonesCore(
  ctx: Pick<MutationCtx, 'db'>,
  now: number,
): Promise<{ deletedCount: number; hasMore: boolean }> {
  const rows = await ctx.db
    .query('mapSignatures')
    .withIndex('by_purge_after', (q) =>
      q.gt('purgeAfter', null).lte('purgeAfter', now),
    )
    .take(SIGNATURE_TOMBSTONE_DELETE_CAP + 1);

  const toDelete = rows.slice(0, SIGNATURE_TOMBSTONE_DELETE_CAP);
  for (const row of toDelete) {
    await ctx.db.delete(row._id);
  }

  return {
    deletedCount: toDelete.length,
    hasMore: rows.length > SIGNATURE_TOMBSTONE_DELETE_CAP,
  };
}
