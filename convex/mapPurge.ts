import { v } from 'convex/values';
import type { Doc, TableNames } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';

export const MAP_PURGE_BATCH = 128;

export const MAP_PURGE_TABLES = [
  'mapAccess',
  'mapAccessProjectionWatermarks',
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
