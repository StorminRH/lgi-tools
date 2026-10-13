import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { takeIndexedOrThrow } from './indexedQuery';

// Keep every map-wide tracking reader within the same supported capacity.
// Larger maps need paginated subscriptions rather than silently dropping pilots.
export const TRACKED_CHARACTERS_PER_MAP_CAP = 1024;

export const TRACKED_CHARACTERS_PER_MAP_USER_CAP = 32;

export async function readMapTracking(ctx: QueryCtx, mapId: string) {
  return await takeIndexedOrThrow(
    ctx.db.query('mapTracking').withIndex('by_map', (q) => q.eq('mapId', mapId)),
    TRACKED_CHARACTERS_PER_MAP_CAP,
    {
      code: 'TRACKING_SCAN_LIMIT',
      detail: `Map tracking exceeds the ${TRACKED_CHARACTERS_PER_MAP_CAP}-character capacity.`,
    },
  );
}

export function requireMapTrackingSpace(count: number): void {
  if (count >= TRACKED_CHARACTERS_PER_MAP_CAP) {
    throw new ConvexError({
      code: 'TRACKING_MAP_CAP_EXCEEDED',
      detail: `This map is at its ${TRACKED_CHARACTERS_PER_MAP_CAP}-character tracking limit.`,
    });
  }
}

/**
 * One account's tracking rows on one map, oldest first (by_map_user ends in
 * _creationTime). Writers keep this at or under the cap; the extra row lets a
 * caller detect a breach. Never throws, so opt-out, merge and actor naming keep
 * working past a breach.
 */
export async function readUserMapTracking(
  ctx: QueryCtx,
  mapId: string,
  userId: string,
): Promise<Doc<'mapTracking'>[]> {
  return await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP + 1);
}
