import { v } from 'convex/values';
import type { Doc, TableNames } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { deleteIndexedBatch, type IndexedBatchDeleteResult } from './lib/indexedQuery';

export const MAP_PURGE_BATCH = 128;

/**
 * Every map-keyed table except mapAccessProjectionWatermarks. The watermark
 * outlives the chain: callers fence a map with an empty projection before they
 * purge it, and the kept watermark keeps refusing any projection reserved
 * before that fence, so a late delivery cannot re-grant an erased map.
 */
export const MAP_PURGE_TABLES = [
  'mapAccess',
  'mapSystems',
  'mapConnections',
  'mapJumpBookkeeping',
  'mapEvents',
  'mapSignatures',
  'mapNotes',
  'mapSignatureActivity',
  'mapTracking',
] as const satisfies readonly TableNames[];

/** Deletes one batch of a map's rows from one map-keyed table. */
export function purgeMapTable<Table extends (typeof MAP_PURGE_TABLES)[number]>(
  ctx: MutationCtx,
  table: Table,
  mapId: string,
): Promise<IndexedBatchDeleteResult> {
  return deleteIndexedBatch(
    ctx.db
      .query(table)
      .withIndex('by_map', (query) =>
        query.eq('mapId', mapId as Doc<Table>['mapId']),
      ),
    MAP_PURGE_BATCH,
    (row) => ctx.db.delete(table, row._id),
  );
}

export const purgeMapBatch = internalMutation({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const results: IndexedBatchDeleteResult[] = [];
    for (const table of MAP_PURGE_TABLES) {
      results.push(await purgeMapTable(ctx, table, mapId));
    }
    return {
      deleted: results.reduce((total, result) => total + result.deleted, 0),
      hasMore: results.some((result) => result.hasMore),
    };
  },
});
