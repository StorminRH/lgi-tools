// The bounded expiry-only cleanup owner for reversible signature tombstones.
//
// This module is deliberately tiny and single-purpose because a source-contract test asserts its
// exact database shape: ONE indexed mapSignatures query, no mapSignatureActivity query, and no
// db.get. The activity companion is deleted once at tombstone time, so cleanup performs no per-row
// companion lookup — the N+1 that would otherwise spend the per-transaction index-read budget on a
// backlog drain.
import type { MutationCtx } from '../_generated/server';

/** Maximum tombstones one cleanup call deletes, bounding the transaction's write budget. */
export const SIGNATURE_PURGE_BATCH = 128;

/** The outcome of one bounded cleanup call, including exact continuation truth. */
export interface SignaturePurgeResult {
  readonly deletedCount: number;
  readonly hasMore: boolean;
}

/**
 * Deletes the oldest expired signature tombstones, up to {@link SIGNATURE_PURGE_BATCH} per call.
 *
 * The range is `purgeAfter > null && purgeAfter <= now`. Convex orders null below every number, so
 * an ACTIVE row — whose `purgeAfter` is null — cannot enter the range at all and survives every
 * call by construction, rather than by a filter that could be forgotten.
 *
 * It reads one row beyond the delete cap so `hasMore` is exact rather than inferred from a full
 * batch: reading 129 and deleting 128 distinguishes "exactly a full batch remained" from "another
 * call is required", without widening the delete budget.
 */
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
