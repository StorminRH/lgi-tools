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

export const watchMapSystems = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) =>
    await readSystemPage(ctx, mapId, paginationOpts),
});
