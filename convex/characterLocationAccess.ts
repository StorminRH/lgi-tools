import { v, type Infer } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import { uniqueByUserCharacter } from './lib/indexedQuery';
import { deleteCharacterCache } from './lib/locationCaches';

export const leaseWriteValidator = v.object({
  characterId: v.number(),
  accessToken: v.string(),
  expiresAt: v.number(),
});

export type LeaseWrite = Infer<typeof leaseWriteValidator>;

/**
 * Upserts leases for still-tracked characters. A lease left by a character that
 * stopped being tracked is deleted by the next location run.
 */
export async function writeAccessLeases(
  ctx: MutationCtx,
  userId: string,
  leases: readonly LeaseWrite[],
  now: number,
): Promise<void> {
  for (const lease of leases) {
    await upsertAccessLease(ctx, userId, lease, now);
  }
}

export async function clearAccessLeases(
  ctx: MutationCtx,
  userId: string,
  characterIds: readonly number[],
): Promise<void> {
  for (const characterId of characterIds) {
    await deleteCharacterCache(ctx, 'characterLocationAccess', userId, characterId);
  }
}

async function upsertAccessLease(
  ctx: MutationCtx,
  userId: string,
  lease: LeaseWrite,
  now: number,
): Promise<void> {
  const tracking = await ctx.db
    .query('mapTracking')
    .withIndex('by_user_character', (q) =>
      q.eq('userId', userId).eq('characterId', lease.characterId),
    )
    .first();
  if (tracking === null) return;
  const existing = await uniqueByUserCharacter(ctx, 'characterLocationAccess', userId, lease.characterId);
  if (existing !== null) {
    await ctx.db.patch('characterLocationAccess', existing._id, {
      accessToken: lease.accessToken,
      expiresAt: lease.expiresAt,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert('characterLocationAccess', {
    userId,
    characterId: lease.characterId,
    accessToken: lease.accessToken,
    expiresAt: lease.expiresAt,
    updatedAt: now,
  });
}
