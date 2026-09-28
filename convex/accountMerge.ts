import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import { deleteTrackingRow } from './mapTrackingTeardown';

export interface MergeUserStateResult {
  readonly trackingMoved: number;
  readonly trackingDropped: number;
  readonly deleted: number;
}

async function moveTrackingRow(
  ctx: MutationCtx,
  row: Doc<'mapTracking'>,
  survivorUserId: string,
): Promise<'moved' | 'duplicate' | 'dropped'> {
  const survivorRows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', row.mapId).eq('userId', survivorUserId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP);
  if (survivorRows.some((survivorRow) => survivorRow.characterId === row.characterId)) {
    await ctx.db.delete(row._id);
    return 'duplicate';
  }
  if (survivorRows.length >= TRACKED_CHARACTERS_PER_MAP_USER_CAP) {
    await deleteTrackingRow(ctx, row);
    return 'dropped';
  }
  await ctx.db.patch(row._id, { userId: survivorUserId });
  return 'moved';
}

export const mergeUserState = internalMutation({
  args: { sourceUserId: v.string(), survivorUserId: v.string() },
  returns: v.object({
    trackingMoved: v.number(),
    trackingDropped: v.number(),
    deleted: v.number(),
  }),
  handler: async (ctx, { sourceUserId, survivorUserId }): Promise<MergeUserStateResult> => {
    const counts = { trackingMoved: 0, trackingDropped: 0, deleted: 0 };
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) => q.eq('userId', sourceUserId))
      .collect();
    for (const row of tracking) {
      const outcome = await moveTrackingRow(ctx, row, survivorUserId);
      if (outcome === 'moved') counts.trackingMoved += 1;
      else if (outcome === 'dropped') counts.trackingDropped += 1;
      else counts.deleted += 1;
    }
    const claims = await ctx.db
      .query('mapAccess')
      .withIndex('by_user', (q) => q.eq('userId', sourceUserId))
      .collect();
    for (const claim of claims) {
      await ctx.db.delete(claim._id);
    }
    const drained = await ctx.runMutation(internal.characterLocationPurge.purgeForUser, {
      userId: sourceUserId,
      characterId: null,
    });
    counts.deleted += claims.length + drained.deletedLocations + drained.deletedTracking;
    return counts;
  },
});
