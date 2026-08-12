// Complete collaborative-map deletion owner. Every declared table is keyed by
// mapId and drained through its by_map index in a bounded transaction. Neon
// decides when a map is eligible; this module only deletes the stated map's
// collaborative rows and reports truthful continuation state.
import { v } from 'convex/values';
import type { Doc, TableNames } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';

/** Maximum rows removed from each map-keyed table in one transaction. */
export const MAP_PURGE_BATCH = 128;

/** Single census-backed registry of every Convex table keyed by mapId. */
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

type MapPurgeTable = (typeof MAP_PURGE_TABLES)[number];

interface TablePurgeResult {
  readonly deleted: number;
  readonly hasMore: boolean;
}

/** Deletes one fair, bounded slice from one map-keyed table. */
async function purgeTable<Table extends MapPurgeTable>(
  ctx: MutationCtx,
  table: Table,
  mapId: string,
): Promise<TablePurgeResult> {
  const rows = await ctx.db
    .query(table)
    .withIndex('by_map', (query) =>
      query.eq('mapId', mapId as Doc<Table>['mapId']),
    )
    .take(MAP_PURGE_BATCH + 1);
  const doomed = rows.slice(0, MAP_PURGE_BATCH) as Doc<Table>[];
  for (const row of doomed) {
    await ctx.db.delete(row._id);
  }
  return {
    deleted: doomed.length,
    hasMore: rows.length > MAP_PURGE_BATCH,
  };
}

/**
 * Deletes up to 128 rows from every map-keyed table. Completed invocations are
 * persisted progress; a later invocation re-scans the remaining indexed rows.
 */
export const purgeMapBatch = internalMutation({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const results: TablePurgeResult[] = [];
    for (const table of MAP_PURGE_TABLES) {
      results.push(await purgeTable(ctx, table, mapId));
    }
    return {
      deleted: results.reduce((total, result) => total + result.deleted, 0),
      hasMore: results.some((result) => result.hasMore),
    };
  },
});
