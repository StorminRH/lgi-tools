import type { MutationCtx } from '../_generated/server';

export const SIGNATURE_PURGE_BATCH = 128;

export interface SignaturePurgeResult {
  readonly deletedCount: number;
  readonly hasMore: boolean;
}

export async function purgeExpiredSignatures(
  ctx: MutationCtx,
  now: number,
): Promise<SignaturePurgeResult> {
  const expired = await ctx.db
    .query('mapSignatures')
    .withIndex('by_purge_after', (q) => q.gt('purgeAfter', null).lte('purgeAfter', now))
    .take(SIGNATURE_PURGE_BATCH + 1);

  const doomed = expired.slice(0, SIGNATURE_PURGE_BATCH);
  for (const signature of doomed) {
    await ctx.db.delete(signature._id);
  }

  return {
    deletedCount: doomed.length,
    hasMore: expired.length > SIGNATURE_PURGE_BATCH,
  };
}
