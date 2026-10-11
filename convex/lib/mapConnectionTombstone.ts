import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/**
 * Re-arms a removed connection's purge time. A live row, or one already due
 * at `purgeAfter`, is left unwritten. Returns whether the row was patched.
 */
export async function setRemovedPurgeAfter(
  ctx: MutationCtx,
  row: Pick<Doc<'mapConnections'>, '_id' | 'tombstone'>,
  purgeAfter: number,
): Promise<boolean> {
  const { tombstone } = row;
  if (tombstone.kind !== 'removed' || tombstone.purgeAfter === purgeAfter) return false;
  await ctx.db.patch('mapConnections', row._id, { tombstone: { ...tombstone, purgeAfter } });
  return true;
}
