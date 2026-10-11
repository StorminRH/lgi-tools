import { v } from 'convex/values';
import { type MutationCtx, internalMutation } from './_generated/server';
import { purgeMapTable } from './mapPurge';

export async function deleteForMapCharacter(
  ctx: MutationCtx,
  mapId: string,
  characterId: number,
): Promise<number> {
  const row = await ctx.db
    .query('mapJumpBookkeeping')
    .withIndex('by_map_character', (q) =>
      q.eq('mapId', mapId).eq('characterId', characterId),
    )
    .unique();
  if (row === null) return 0;
  await ctx.db.delete(row._id);
  return 1;
}

export const purgeForMap = internalMutation({
  args: { mapId: v.string() },
  handler: (ctx, { mapId }) => purgeMapTable(ctx, 'mapJumpBookkeeping', mapId),
});
