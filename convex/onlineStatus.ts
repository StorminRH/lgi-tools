import { internalMutation, type MutationCtx, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { collectByUser, viewerUserDocs } from './lib/indexedQuery';
import { purgeScopeArgs } from './lib/syncFields';

function viewerOnline(doc: Doc<'characterOnline'>) {
  return {
    characterId: doc.characterId,
    online: doc.online,
  };
}

export const forViewer = query({
  args: {},
  handler: async (ctx) =>
    viewerUserDocs(
      ctx,
      (userId) => collectByUser(ctx, 'characterOnline', userId),
      viewerOnline,
    ),
});

export async function drainCharacterOnline(ctx: MutationCtx, limit: number): Promise<void> {
  const rows = await ctx.db.query('characterOnline').take(limit);
  for (const row of rows) await ctx.db.delete(row._id);
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
