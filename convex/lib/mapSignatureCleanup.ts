import type { MutationCtx } from '../_generated/server';
import { deleteIndexedBatch } from './indexedQuery';

export const SIGNATURE_PURGE_BATCH = 128;

export interface SignaturePurgeResult {
  readonly deletedCount: number;
  readonly hasMore: boolean;
}

export async function purgeExpiredSignatures(
  ctx: MutationCtx,
  now: number,
): Promise<SignaturePurgeResult> {
  const { deleted, hasMore } = await deleteIndexedBatch(
    ctx.db
      .query('mapSignatures')
      .withIndex('by_purge_after', (q) => q.gt('purgeAfter', null).lte('purgeAfter', now)),
    SIGNATURE_PURGE_BATCH,
    (signature) => ctx.db.delete('mapSignatures', signature._id),
  );
  return { deletedCount: deleted, hasMore };
}
