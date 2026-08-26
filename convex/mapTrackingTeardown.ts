import type { MutationCtx } from './_generated/server';

// Map-scoped teardown home. mapAccessProjection (revocation cascade, map
// teardown, account claims door) calls these instead of restating the queries.
// The bearer purge door (characterLocation.purgeForUser) keeps its own
// per-(user, character) delete: its key shape spans both tables at once and
// does not fit these map-scoped helpers.

/** Deletes every mapTracking row for one user on one map (revocation cascade). */
export async function deleteTrackingForUser(
  ctx: MutationCtx,
  mapId: string,
  userId: string,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/** Full-map tracking sweep used when claims: [] tears the map down. */
export async function deleteAllTrackingForMap(
  ctx: MutationCtx,
  mapId: string,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/**
 * Batch-deletes one user's tracking rows across all maps (account purge).
 * Returns hasMore so a calling door can loop without an unbounded
 * single-transaction scan.
 */
export async function purgeTrackingForUserBatch(
  ctx: MutationCtx,
  userId: string,
  limit: number,
): Promise<{ deleted: number; hasMore: boolean }> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_user_character', (q) => q.eq('userId', userId))
    .take(limit + 1);
  const doomed = rows.slice(0, limit);
  for (const row of doomed) {
    await ctx.db.delete(row._id);
  }
  return { deleted: doomed.length, hasMore: rows.length > limit };
}
