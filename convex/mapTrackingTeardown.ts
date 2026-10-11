import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { deleteIndexedBatch, type IndexedBatchDeleteResult } from './lib/indexedQuery';
import { deleteForMapCharacter } from './mapJumpBookkeeping';

export async function deleteTrackingRow(
  ctx: MutationCtx,
  row: Doc<'mapTracking'>,
): Promise<number> {
  await ctx.db.delete(row._id);
  return deleteBookkeepingIfUntracked(ctx, row);
}

export async function deleteBookkeepingIfUntracked(
  ctx: MutationCtx,
  { mapId, characterId }: Pick<Doc<'mapTracking'>, 'mapId' | 'characterId'>,
): Promise<number> {
  const survivor = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_character', (q) =>
      q.eq('mapId', mapId).eq('characterId', characterId),
    )
    .first();
  if (survivor !== null) return 0;
  return deleteForMapCharacter(ctx, mapId, characterId);
}

/**
 * Reads the map's tracking once and deletes every row `keep` rejects, with
 * its bookkeeping. The read never throws on capacity: revocation must not
 * fail closed on an over-cap map, and every insert path enforces the cap.
 */
export async function pruneMapTracking(
  ctx: MutationCtx,
  mapId: string,
  keep: (row: Doc<'mapTracking'>) => boolean,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .collect();
  for (const row of rows) {
    if (!keep(row)) await deleteTrackingRow(ctx, row);
  }
}

export function purgeTrackingForUserBatch(
  ctx: MutationCtx,
  userId: string,
  limit: number,
): Promise<IndexedBatchDeleteResult> {
  return deleteIndexedBatch(
    ctx.db.query('mapTracking').withIndex('by_user_character', (q) => q.eq('userId', userId)),
    limit,
    (row) => deleteTrackingRow(ctx, row),
  );
}
