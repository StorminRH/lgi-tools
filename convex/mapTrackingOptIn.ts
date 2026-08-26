import { ConvexError, v } from 'convex/values';
import { type MutationCtx, mutation } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireMapAccess } from './lib/mapAccess';

/**
 * Per-(map, user) tracked-character bound, enforced at opt-in. Bounds every
 * downstream read/sweep of this table (a user's linked roster is far smaller;
 * the cap only stops scripted growth against the public mutation).
 */
export const TRACKED_CHARACTERS_PER_MAP_USER_CAP = 32;

interface TrackingIdentity {
  mapId: string;
  userId: string;
  characterId: number;
}

async function enableTracking(
  ctx: MutationCtx,
  identity: TrackingIdentity,
  existing: readonly Doc<'mapTracking'>[],
  match: Doc<'mapTracking'> | undefined,
): Promise<void> {
  if (match !== undefined) return;
  if (existing.length >= TRACKED_CHARACTERS_PER_MAP_USER_CAP) {
    throw new ConvexError({
      code: 'TRACKING_CAP_EXCEEDED',
      detail: `At most ${TRACKED_CHARACTERS_PER_MAP_USER_CAP} tracked characters per map.`,
    });
  }
  await ctx.db.insert('mapTracking', identity);
}

async function disableTracking(
  ctx: MutationCtx,
  match: Doc<'mapTracking'> | undefined,
): Promise<void> {
  if (match === undefined) return;
  await ctx.db.delete(match._id);
}

/**
 * Opt a character into or out of tracking on one map. Requires a view claim;
 * the row's userId is always the caller's JWT subject. tracked=true upserts;
 * tracked=false deletes. Idempotent either way.
 */
export const setTracking = mutation({
  args: {
    mapId: v.string(),
    characterId: v.number(),
    tracked: v.boolean(),
  },
  handler: async (ctx, { mapId, characterId, tracked }) => {
    const principal = await requireMapAccess(ctx, mapId, 'view');
    const existing = await ctx.db
      .query('mapTracking')
      .withIndex('by_map_user', (q) =>
        q.eq('mapId', mapId).eq('userId', principal.userId),
      )
      .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP + 1);
    const match = existing.find((row) => row.characterId === characterId);

    if (tracked) {
      await enableTracking(
        ctx,
        {
          mapId,
          userId: principal.userId,
          characterId,
        },
        existing,
        match,
      );
      return { tracked: true };
    }

    await disableTracking(ctx, match);
    return { tracked: false };
  },
});
