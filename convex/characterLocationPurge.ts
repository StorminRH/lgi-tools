import { internalMutation, type MutationCtx } from './_generated/server';
import { purgeScopeArgs } from './lib/syncFields';
import { deleteBookkeepingIfUntracked, deleteTrackingRow } from './mapTrackingTeardown';

export interface PurgeScope {
  readonly userId: string;
  readonly characterId: number | null;
}

export interface PurgeCounts {
  readonly deletedLocations: number;
  readonly deletedTracking: number;
  readonly deletedBookkeeping: number;
}

export async function purgeUserScope(
  ctx: MutationCtx,
  { userId, characterId }: PurgeScope,
): Promise<PurgeCounts> {
  const locations = await ctx.db
    .query('characterLocation')
    .withIndex('by_user_character', (q) => {
      const byUser = q.eq('userId', userId);
      return characterId === null ? byUser : byUser.eq('characterId', characterId);
    })
    .collect();
  const heldOnline = await ctx.db
    .query('characterLocationOnline')
    .withIndex('by_user_character', (q) => {
      const byUser = q.eq('userId', userId);
      return characterId === null ? byUser : byUser.eq('characterId', characterId);
    })
    .collect();
  const tracking = await ctx.db
    .query('mapTracking')
    .withIndex('by_user_character', (q) => {
      const byUser = q.eq('userId', userId);
      return characterId === null ? byUser : byUser.eq('characterId', characterId);
    })
    .collect();
  const accessLeases = await ctx.db
    .query('characterLocationAccess')
    .withIndex('by_user_character', (q) => {
      const byUser = q.eq('userId', userId);
      return characterId === null ? byUser : byUser.eq('characterId', characterId);
    })
    .collect();
  const covered = await ctx.db
    .query('characterLocationCovered')
    .withIndex('by_user_character', (q) => {
      const byUser = q.eq('userId', userId);
      return characterId === null ? byUser : byUser.eq('characterId', characterId);
    })
    .collect();

  for (const doc of locations) await ctx.db.delete(doc._id);
  for (const doc of heldOnline) await ctx.db.delete(doc._id);
  let deletedBookkeeping = 0;
  for (const doc of tracking) {
    deletedBookkeeping += await deleteTrackingRow(ctx, doc);
  }
  for (const doc of accessLeases) await ctx.db.delete(doc._id);
  for (const doc of covered) await ctx.db.delete(doc._id);

  const stampCharacterIds =
    characterId !== null
      ? [characterId]
      : [...new Set([...locations, ...tracking].map((doc) => doc.characterId))];
  for (const stampCharacterId of stampCharacterIds) {
    const stamps = await ctx.db
      .query('mapJumpBookkeeping')
      .withIndex('by_character', (q) => q.eq('characterId', stampCharacterId))
      .collect();
    for (const stamp of stamps) {
      deletedBookkeeping += await deleteBookkeepingIfUntracked(ctx, stamp);
    }
  }
  return {
    deletedLocations: locations.length,
    deletedTracking: tracking.length,
    deletedBookkeeping,
  };
}

export const purgeForUser = internalMutation({
  args: purgeScopeArgs,
  handler: (ctx, scope) => purgeUserScope(ctx, scope),
});
