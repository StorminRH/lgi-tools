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
    return result as PaginationResult<ResolvedMapConnection>;
  }

  const result = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', null))
    .paginate(bounded);
  return {
    ...result,
    page: result.page.filter((row) => !isTombstoned(row)) as UnresolvedMapConnection[],
  };
}

export const watchMapConnections = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }): Promise<
    PaginationResult<ResolvedMapConnection>
  > =>
    await readConnectionPage(ctx, mapId, paginationOpts, 'resolved'),
});

export const watchUnresolvedHoles = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }): Promise<
    PaginationResult<UnresolvedMapConnection>
  > =>
    await readConnectionPage(ctx, mapId, paginationOpts, 'unresolved'),
});
