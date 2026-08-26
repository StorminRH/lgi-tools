// Connection pages of the production chain read path. Resolved canvas edges and
// unresolved matching slots are two public queries, not one aggregate
// (contract HC-2). They share this file because they own the same table's
// disjoint `by_map_to` ranges: numeric destinations vs null destinations.
import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server';
import { v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import type { Doc } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';
import { clampPageSize, deniedPage } from './mapChainPage';

type ResolvedMapConnection = Doc<'mapConnections'> & { readonly toSystemId: number };
type UnresolvedMapConnection = Doc<'mapConnections'> & { readonly toSystemId: null };
type ConnectionPageMode = 'resolved' | 'unresolved';

/**
 * Reads one access-gated connection page through a destination-specific index
 * range. Numeric destinations and null destinations are disjoint ranges, so
 * unresolved rows can never enter the shipped canvas page.
 */
async function readConnectionPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
  mode: 'resolved',
): Promise<PaginationResult<ResolvedMapConnection>>;
async function readConnectionPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
  mode: 'unresolved',
): Promise<PaginationResult<UnresolvedMapConnection>>;
async function readConnectionPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
  mode: ConnectionPageMode,
): Promise<PaginationResult<ResolvedMapConnection | UnresolvedMapConnection>> {
  const principal = await tryMapAccess(ctx, mapId, 'view');
  if (principal === null) {
    return deniedPage<ResolvedMapConnection | UnresolvedMapConnection>();
  }

  const bounded = clampPageSize(paginationOpts);
  if (mode === 'resolved') {
    const result = await ctx.db
      .query('mapConnections')
      .withIndex('by_map_to', (q) => q.eq('mapId', mapId).gt('toSystemId', null))
      .paginate(bounded);
    // The indexed range is the proof that every returned destination is numeric.
    return result as PaginationResult<ResolvedMapConnection>;
  }

  const result = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', null))
    .paginate(bounded);
  return {
    ...result,
    // Tombstoned stubs stay available to sever/restore internally but never
    // re-enter the live candidate feed merely because their anchor is placed again.
    page: result.page.filter((row) => !isTombstoned(row)) as UnresolvedMapConnection[],
  };
}

/**
 * Subscribes to one page of a map's connections.
 *
 * Its read set is exactly the numeric-destination portion of this map's
 * `mapConnections.by_map_to` range plus the caller's claim row, disjoint from
 * both systems and null-destination slots. No `db.get` join is needed server-side.
 */
export const watchMapConnections = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }): Promise<
    PaginationResult<ResolvedMapConnection>
  > =>
    await readConnectionPage(ctx, mapId, paginationOpts, 'resolved'),
});

/**
 * Subscribes to one page of active unresolved wormhole slots. This is a
 * separate feed for canvas stubs and matching/prompt consumers.
 */
export const watchUnresolvedHoles = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }): Promise<
    PaginationResult<UnresolvedMapConnection>
  > =>
    await readConnectionPage(ctx, mapId, paginationOpts, 'unresolved'),
});
