import { v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { collectByUser } from './lib/indexedQuery';
import { getSyncSubjectForGeneration } from './lib/subjects';

const leaseWriteValidator = v.object({
  characterId: v.number(),
  accessToken: v.string(),
  expiresAt: v.number(),
});

export const accessLeases = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await collectByUser(ctx, 'characterLocationAccess', userId);
    return rows.map((row) => ({
      characterId: row.characterId,
      accessToken: row.accessToken,
      expiresAt: row.expiresAt,
    }));
  },
});

export const putAccessLeases = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    leases: v.array(leaseWriteValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await getSyncSubjectForGeneration(ctx.db, 'characterLocation', args) === null) return null;
    for (const lease of args.leases) {
      await upsertAccessLease(ctx, { userId: args.userId, ...lease });
    }
    return null;
  },
});

export const clearAccessLease = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    characterId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await getSyncSubjectForGeneration(ctx.db, 'characterLocation', args) === null) return null;
    const existing = await findAccessLease(ctx, args.userId, args.characterId);
    if (existing !== null) await ctx.db.delete(existing._id);
    return null;
  },
});

async function upsertAccessLease(
  ctx: MutationCtx,
  args: {
    userId: string;
    characterId: number;
    accessToken: string;
    expiresAt: number;
  },
): Promise<void> {
  const tracking = await ctx.db
    .query('mapTracking')
    .withIndex('by_user_character', (q) =>
      q.eq('userId', args.userId).eq('characterId', args.characterId),
    )
    .first();
  if (tracking === null) return;
  const existing = await findAccessLease(ctx, args.userId, args.characterId);
  const now = Date.now();
  if (existing !== null) {
    await ctx.db.patch(existing._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert('characterLocationAccess', {
    userId: args.userId,
    characterId: args.characterId,
    accessToken: args.accessToken,
    expiresAt: args.expiresAt,
    updatedAt: now,
  });
}

function findAccessLease(
  ctx: Pick<MutationCtx, 'db'>,
  userId: string,
  characterId: number,
) {
  return ctx.db
    .query('characterLocationAccess')
    .withIndex('by_user_character', (q) =>
      q.eq('userId', userId).eq('characterId', characterId),
    )
    .unique();
}
