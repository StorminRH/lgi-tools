import { ConvexError } from 'convex/values';
import type { QueryCtx } from '../_generated/server';

// Keep every map-wide tracking reader within the same supported capacity.
// Larger maps need paginated subscriptions rather than silently dropping pilots.
export const TRACKED_CHARACTERS_PER_MAP_CAP = 1024;

export async function readMapTracking(ctx: QueryCtx, mapId: string) {
  const rows = await ctx.db.query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(TRACKED_CHARACTERS_PER_MAP_CAP + 1);
  if (rows.length > TRACKED_CHARACTERS_PER_MAP_CAP) {
    throw new ConvexError({
      code: 'TRACKING_SCAN_LIMIT',
      detail: `Map tracking exceeds the ${TRACKED_CHARACTERS_PER_MAP_CAP}-character capacity.`,
    });
  }
  return rows;
}

export function requireMapTrackingSpace(count: number): void {
  if (count >= TRACKED_CHARACTERS_PER_MAP_CAP) {
    throw new ConvexError({
      code: 'TRACKING_MAP_CAP_EXCEEDED',
      detail: `This map has reached its ${TRACKED_CHARACTERS_PER_MAP_CAP}-character tracking limit. Stop tracking a character before adding another.`,
    });
  }
}
