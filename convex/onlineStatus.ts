// The retired online-status tracker's drain-window keeper. The dataset lost
// its syncer when the location sync absorbed the in-game online probe and the
// portrait dot was removed; what remains here is exactly what the drain
// window still needs, until the wipe deploy drops the schema literals and the
// characterOnline table:
//   - forViewer: tabs loaded before the retirement deploy still hold this
//     subscription — it must answer (with whatever rows remain, then none)
//     rather than crash them.
//   - purgeForUser: the bearer-gated /purge-online door (Neon → Convex) must
//     keep working for account/character purges while the table exists.
//   - drainCharacterOnline: the sweep's temporary Pass D delegates the
//     table's teardown here so characterOnline keeps ONE owner.
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

/**
 * The calling user's per-character online flags — kept only for pre-deploy
 * tabs whose subscription must keep answering through the drain window. Rows
 * only ever shrink now (drain GC + purge); a character with no doc is absent.
 */
export const forViewer = query({
  args: {},
  handler: async (ctx) =>
    viewerUserDocs(
      ctx,
      (userId) => collectByUser(ctx, 'characterOnline', userId),
      viewerOnline,
    ),
});

/**
 * Deletes up to `limit` characterOnline rows — the drain GC's per-run batch,
 * owned here beside the table's purge door rather than inline in the engine.
 * Removed with the wipe deploy alongside the table itself.
 */
export async function drainCharacterOnline(ctx: MutationCtx, limit: number): Promise<void> {
  const rows = await ctx.db.query('characterOnline').take(limit);
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * Explicit teardown for a Neon-side account/character purge (ACCOUNT.2).
 * `characterId` null tears down the whole user (an account-nuke); a number
 * tears down one character (a single character-purge / unlink). Idempotent:
 * deleting absent rows is a no-op, so a retried best-effort purge is safe.
 * Reached only via the bearer-gated /purge-online HTTP action (Neon → Convex,
 * one-directional).
 */
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
