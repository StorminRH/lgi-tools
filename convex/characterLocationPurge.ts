import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { UserCharacterTable } from './lib/indexedQuery';
import { purgeScopeArgs } from './lib/syncFields';
import { deleteBookkeepingIfUntracked, deleteTrackingRow } from './mapTrackingTeardown';

type UserScopeTable = UserCharacterTable | 'mapTracking';

/** Every row the user holds in `table`, or only the named character's when one is given. */
async function collectUserScope<T extends UserScopeTable>(
  ctx: MutationCtx,
  table: T,
  userId: string,
  characterId: number | null,
): Promise<Doc<T>[]> {
  // The query runs over the union so withIndex resolves; every row it returns comes from T.
  const rows: Doc<UserScopeTable>[] = await ctx.db
    .query(table as UserScopeTable)
    .withIndex('by_user_character', (q) => {
      const byUser = q.eq('userId', userId);
      return characterId === null ? byUser : byUser.eq('characterId', characterId);
    })
    .collect();
  return rows as unknown as Doc<T>[];
}

export const purgeForUser = internalMutation({
  args: purgeScopeArgs,
  handler: async (ctx, { userId, characterId }) => {
    const locations = await collectUserScope(ctx, 'characterLocation', userId, characterId);
    const heldOnline = await collectUserScope(ctx, 'characterLocationOnline', userId, characterId);
    const tracking = await collectUserScope(ctx, 'mapTracking', userId, characterId);
    const accessLeases = await collectUserScope(ctx, 'characterLocationAccess', userId, characterId);
    const covered = await collectUserScope(ctx, 'characterLocationCovered', userId, characterId);

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
  },
});
