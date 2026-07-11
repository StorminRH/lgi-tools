// Composes the full SDE pipeline: CSV ingest → tree resolver →
// tracked-types seeding into market_prices. Lives at this layer rather
// than inside either data slice because it's the only point that
// touches both eve-data AND market-prices, and the design doc keeps
// those two slices isolated from each other (Industry Planner math
// will compose them similarly).
//
// Callers: src/db/ingest-sde-if-empty.ts (vercel-build),
//          src/db/refresh-sde.ts (CLI recovery hook),
//          src/app/api/cron/refresh-sde/route.ts (daily drift cron).

import { sql } from 'drizzle-orm';
import { runIngest, type IngestSummary } from '@/data/eve-data/ingest';
import { listTrackedTypeIds } from '@/data/eve-data/queries';
import { resolveNpcStationNames } from '@/data/eve-data/station-names';
import {
  resolveAllTrees,
  type ResolveSummary,
} from '@/data/eve-data/tree-resolver';
import { listMissingTypeIds } from '@/data/market-prices/queries';
import { marketPrices } from '@/data/market-prices/schema';
import type { PostgresJsDb } from '@/lib/db-types';

// Driver-CONCRETE (PostgresJsDb), not the shared dual-driver AnyPgDb: the
// pipeline composes runIngest, which runs the TRUNCATE + bulk ingest in an
// interactive transaction only postgres-js exposes. All three callers pass a
// postgres-js `drizzle(client)`.


export type SeedSummary = {
  tracked: number;
  missing: number;
  inserted: number;
};

export type SdePipelineSummary = {
  ingest: IngestSummary;
  resolve: ResolveSummary;
  seed: SeedSummary;
  stationNames: { resolved: number };
  durationMs: number;
};

// Seed market_prices with one row per tracked type ID that isn't
// already present. NULL prices, epoch staleness, source 'esi' — the
// next price-refresh cron tick (or on-demand request) fills them in.
// `ON CONFLICT DO NOTHING` preserves any existing rows verbatim, so
// the 54 wormhole-site rows seeded by the wormhole-sites ingest stay
// intact with their current prices.
export async function seedTrackedTypes(db: PostgresJsDb): Promise<SeedSummary> {
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

  // Batched insert keeps the parameter count under Postgres's 64k bind
  // limit. 6,000 rows × 10 cols = 60k params — close to the wire. 1k
  // rows × 10 cols = 10k params per call, well clear.
  //
  // Count via RETURNING rather than slice size — ON CONFLICT DO NOTHING
  // can skip rows if a concurrent ingest sneaks past the advisory lock
  // (rare but observable in logs would otherwise overcount and confuse
  // debugging).
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

// End-to-end SDE pipeline. Idempotent. Safe to call on every deploy;
// the resolver short-circuits via `tree_resolver_hash` when nothing
// upstream changed, and seeding `ON CONFLICT DO NOTHING` is a no-op
// for rows that already exist.
export async function runSdePipeline(db: PostgresJsDb): Promise<SdePipelineSummary> {
  const start = Date.now();
  const ingest = await runIngest(db);
  const resolve = await resolveAllTrees(db);
  const seed = await seedTrackedTypes(db);
  // Full station names come from ESI, so this runs after runIngest commits — its
  // calls must not share a connection with an open ingest transaction. Best-
  // effort: a failure leaves names null without failing the pipeline.
  const stationNames = await resolveNpcStationNames(db);
  return { ingest, resolve, seed, stationNames, durationMs: Date.now() - start };
}

// Convenience for callers that have a raw postgres-js client and want
// to log a quick row-count summary post-pipeline (cron handler uses
// this in its response body).
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
