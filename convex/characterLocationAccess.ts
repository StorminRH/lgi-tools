import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { collectByUser } from './lib/indexedQuery';

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

export const putAccessLease = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.number(),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .first();
    if (tracking === null) return;
    const existing = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .unique();
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
  },
});

export const clearAccessLease = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
  },
});
