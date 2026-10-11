import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, internalMutation } from './_generated/server';
import { purgeMapTable } from './mapPurge';

/** The character's processed-transition stamp on one map, or null when none is recorded. */
export function findJumpStamp(
  ctx: Pick<QueryCtx, 'db'>,
  mapId: string,
  characterId: number,
): Promise<Doc<'mapJumpBookkeeping'> | null> {
  return ctx.db
    .query('mapJumpBookkeeping')
    .withIndex('by_map_character', (q) =>
      q.eq('mapId', mapId).eq('characterId', characterId),
    )
    .unique();
}

/**
 * Records `at` as the character's last processed transition on the map. The stamp only
 * advances: an `at` at or before the stored stamp writes nothing. Pass the row already read
 * as `existing` (null when there is none) to skip the lookup; leave it out to look it up.
 */
export async function advanceJumpStamp(
  ctx: MutationCtx,
  mapId: string,
  characterId: number,
  at: number,
  existing?: Doc<'mapJumpBookkeeping'> | null,
): Promise<void> {
  const stamp = existing === undefined
    ? await findJumpStamp(ctx, mapId, characterId)
    : existing;
  if (stamp === null) {
    await ctx.db.insert('mapJumpBookkeeping', { mapId, characterId, lastProcessedTransitionAt: at });
  } else if (stamp.lastProcessedTransitionAt < at) {
    await ctx.db.patch('mapJumpBookkeeping', stamp._id, { lastProcessedTransitionAt: at });
  }
}

export async function deleteForMapCharacter(
  ctx: MutationCtx,
  mapId: string,
  characterId: number,
): Promise<number> {
  const row = await findJumpStamp(ctx, mapId, characterId);
  if (row === null) return 0;
  await ctx.db.delete('mapJumpBookkeeping', row._id);
  return 1;
}

export const purgeForMap = internalMutation({
  args: { mapId: v.string() },
  handler: (ctx, { mapId }) => purgeMapTable(ctx, 'mapJumpBookkeeping', mapId),
});
