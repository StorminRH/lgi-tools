import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { collectByUser } from './lib/indexedQuery';

/**
 * Access-token leases for this user. Internal-only — never on forViewer / forMap.
 */
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

/**
 * Upsert one character's EVE access-token lease. Stores Neon's expiresAt.
 */
export const putAccessLease = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.number(),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Same mutation as the write: unlink/transfer purge deletes tracking with
    // the lease, so a late upsert cannot resurrect a credential after teardown.
    // Untrack also removes tracking and skips this write; any already-held lease
    // stays (CONVEX.md), and the next tracked run vends again.
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

/**
 * Drop one character's access lease. ESI 401/403 means the held token is dead;
 * the next sync vends again instead of replaying it until Neon expiresAt.
 * Idempotent when the row is already gone. Does not touch location or tracking.
 */
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
