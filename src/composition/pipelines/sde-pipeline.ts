import { sql } from 'drizzle-orm';
import type { SdePipelineSummary } from '@/data/eve-data/api-contract';
import { runIngest } from '@/data/eve-data/ingest';
import { listTrackedTypeIds } from '@/data/eve-data/queries';
import { resolveNpcStationNames } from '@/data/eve-data/station-names';
import { resolveAllTrees } from '@/data/eve-data/tree-resolver';
import { seedPlaceholderPrices } from '@/data/market-prices/ingest';
import { listMissingTypeIds } from '@/data/market-prices/queries';
import type { PostgresJsDb } from '@/lib/db-types';

/**
 * Seed market_prices with one row per tracked type ID that isn't
 * already present. NULL prices, epoch staleness, source 'esi' — the
 * next price-refresh cron tick (or on-demand request) fills them in.
 * `ON CONFLICT DO NOTHING` preserves any existing rows verbatim, so
 * the 54 wormhole-site rows seeded by the wormhole-sites ingest stay
 * intact with their current prices. `missing` is counted before the
 * insert, so it can exceed `inserted` when another writer got there first.
 */
async function seedTrackedTypes(db: PostgresJsDb): Promise<SdePipelineSummary['seed']> {
  const tracked = await listTrackedTypeIds(db);
  const missing = await listMissingTypeIds(db, tracked);
  const inserted = await seedPlaceholderPrices(db, missing);
  return { tracked: tracked.length, missing: missing.length, inserted };
}

export async function runSdePipeline(db: PostgresJsDb): Promise<SdePipelineSummary> {
  const start = Date.now();
  const ingest = await runIngest(db);
  const resolve = await resolveAllTrees(db);
  const seed = await seedTrackedTypes(db);
  const stationNames = await resolveNpcStationNames(db);
  return { ingest, resolve, seed, stationNames, durationMs: Date.now() - start };
}

export async function summarizeMarketPricesRowCount(
  db: PostgresJsDb,
): Promise<{ total: number; priced: number }> {
  const [row] = await db.execute<{ total: string; priced: string }>(sql`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE best_buy IS NOT NULL OR best_sell IS NOT NULL)::text AS priced
    FROM market_prices
  `);
  if (!row) throw new Error('market_prices count query returned no row');
  return { total: Number(row.total), priced: Number(row.priced) };
}
