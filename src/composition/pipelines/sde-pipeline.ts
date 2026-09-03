import { sql } from 'drizzle-orm';
import type { SdePipelineSummary } from '@/data/eve-data/api-contract';
import { runIngest } from '@/data/eve-data/ingest';
import { listTrackedTypeIds } from '@/data/eve-data/queries';
import { resolveNpcStationNames } from '@/data/eve-data/station-names';
import { resolveAllTrees } from '@/data/eve-data/tree-resolver';
import { listMissingTypeIds } from '@/data/market-prices/queries';
import { marketPrices } from '@/data/market-prices/schema';
import type { PostgresJsDb } from '@/lib/db-types';

type SeedSummary = {
  tracked: number;
  missing: number;
  inserted: number;
};

/**
 * Seed market_prices with one row per tracked type ID that isn't
 * already present. NULL prices, epoch staleness, source 'esi' — the
 * next price-refresh cron tick (or on-demand request) fills them in.
 * `ON CONFLICT DO NOTHING` preserves any existing rows verbatim, so
 * the 54 wormhole-site rows seeded by the wormhole-sites ingest stay
 * intact with their current prices.
 */
async function seedTrackedTypes(db: PostgresJsDb): Promise<SeedSummary> {
  const tracked = await listTrackedTypeIds(db);
  const missing = await listMissingTypeIds(db, tracked);
  if (missing.length === 0) {
    return { tracked: tracked.length, missing: 0, inserted: 0 };
  }

  const now = new Date();
  const epoch = new Date(0);
  const rows = missing.map((typeId) => ({
    typeId,
    bestBuy: null,
    bestSell: null,
    pct5Buy: null,
    pct5Sell: null,
    buyVolume: null,
    sellVolume: null,
    updatedAt: now,
    staleAfter: epoch,
    source: 'esi',
  }));

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const written = await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoNothing()
      .returning({ typeId: marketPrices.typeId });
    inserted += written.length;
  }

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
