import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { deleteForMapCharacter } from './mapJumpBookkeeping';

async function deleteTrackingRow(
  ctx: MutationCtx,
  row: Doc<'mapTracking'>,
): Promise<void> {
  await deleteForMapCharacter(ctx, row.mapId, row.characterId);
  await ctx.db.delete(row._id);
}

export async function deleteTrackingForUser(
  ctx: MutationCtx,
  mapId: string,
  userId: string,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .collect();
  for (const row of rows) {
    await deleteTrackingRow(ctx, row);
  }
}

export async function deleteAllTrackingForMap(
  ctx: MutationCtx,
  mapId: string,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .collect();
  for (const row of rows) {
    await deleteTrackingRow(ctx, row);
  }
}

export async function purgeTrackingForUserBatch(
  ctx: MutationCtx,
  userId: string,
  limit: number,
): Promise<{ deleted: number; hasMore: boolean }> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_user_character', (q) => q.eq('userId', userId))
    .take(limit + 1);
  const doomed = rows.slice(0, limit);
  for (const row of doomed) {
    await deleteTrackingRow(ctx, row);
  }
  return { deleted: doomed.length, hasMore: rows.length > limit };
}
