// Systems page of the production chain read path. Kept in its own module so a
// connection write cannot share this file's handler or invite an aggregate
// systems+connections read (contract HC-2). Convex reactivity is
// read-set–precise: a write re-runs a subscription only when it overlaps the
// exact index ranges THAT EXECUTION touched.
import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';
import { clampPageSize, deniedPage } from './mapChainPage';

/** Reads one access-gated systems page through only that map's `by_map` range. */
async function readSystemPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<'mapSystems'>>> {
  const principal = await tryMapAccess(ctx, mapId, 'view');
  if (principal === null) return deniedPage<Doc<'mapSystems'>>();
  return await ctx.db
    .query('mapSystems')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .paginate(clampPageSize(paginationOpts));
}

/**
 * Subscribes to one page of a map's placed systems.
 *
 * Its read set is exactly the `mapSystems` `by_map` range for this map plus the caller's claim row:
 * the map ID is the leading equality constraint, so another map's rows cannot enter the range, and a
 * connection patch cannot overlap it. Returns Convex's real page and continuation state unwrapped, so
 * a map larger than one page is explicitly incomplete until this cursor reports `isDone` rather than
 * silently truncated.
 */
export const watchMapSystems = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) =>
    await readSystemPage(ctx, mapId, paginationOpts),
});
