import { internalMutation, type MutationCtx } from './_generated/server';
import { purgeScopeArgs } from './lib/syncFields';

export async function drainCharacterOnline(ctx: MutationCtx, limit: number): Promise<number> {
  const rows = await ctx.db.query('characterOnline').take(limit);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

export const purgeForUser = internalMutation({
  args: purgeScopeArgs,
  handler: async (ctx, { userId, characterId }) => {
    const docs =
      characterId === null
        ? await ctx.db
            .query('characterOnline')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect()
        : await ctx.db
            .query('characterOnline')
            .withIndex('by_user_character', (q) =>
              q.eq('userId', userId).eq('characterId', characterId),
            )
            .collect();
    for (const doc of docs) await ctx.db.delete(doc._id);
    return { deleted: docs.length };
  },
});
