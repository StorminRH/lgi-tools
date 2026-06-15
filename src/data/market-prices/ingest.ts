import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { STALE_AFTER_TTL_MS } from './constants';
import { marketPrices } from './schema';
import { fetchPricesFromSource } from './source';
import type { RawMarketPrice } from './types';

export interface RefreshSummary {
  requested: number;
  fetched: number;
  written: number;
  durationMs: number;
  // Source mix of the fetched rows (3.0.10 O-1). A non-zero
  // fuzzworkFallbackCount means ESI degraded for those types; budgetExhausted
  // means ESI's error budget was hit (the CCP rate-limit signal). Route
  // handlers emit O-1 telemetry off these.
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

// EXCLUDED is the proposed-but-conflicted row inside ON CONFLICT.
function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// Accept either driver: the cron/CLI path passes a postgres-js `drizzle(client)`,
// the on-demand refresh route passes the request-path `@/db` proxy (now
// neon-http). Both extend Drizzle's `PgDatabase` and this only uses the shared
// insert/upsert query-builder surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<any, any, any>;

export async function refreshPrices(
  db: AnyPgDb,
  typeIds: number[],
): Promise<RefreshSummary> {
  if (typeIds.length === 0) {
    return {
      requested: 0,
      fetched: 0,
      written: 0,
      durationMs: 0,
      esiCount: 0,
      fuzzworkFallbackCount: 0,
      budgetExhausted: false,
    };
  }
  const { prices: raw, budgetExhausted } = await fetchPricesFromSource(typeIds);
  return persistPrices(db, raw, { requested: typeIds.length, budgetExhausted });
}

// Upsert already-fetched price rows and summarize them. Split out from
// refreshPrices so the refresh-on-view engine can persist rows it already has
// from the short-term coalescing cache (write-behind) without re-fetching the
// source. `requested` defaults to the row count (the on-view caller persists
// exactly what it fetched); `budgetExhausted` is the one degradation fact the
// rows themselves don't carry, threaded through from the source fetch.
export async function persistPrices(
  db: AnyPgDb,
  raw: RawMarketPrice[],
  meta?: { requested?: number; budgetExhausted?: boolean },
): Promise<RefreshSummary> {
  const start = Date.now();
  const summary: RefreshSummary = {
    requested: meta?.requested ?? raw.length,
    fetched: raw.length,
    written: 0,
    durationMs: 0,
    esiCount: 0,
    fuzzworkFallbackCount: 0,
    budgetExhausted: meta?.budgetExhausted ?? false,
  };

  for (const r of raw) {
    if (r.source === 'esi') summary.esiCount++;
    else summary.fuzzworkFallbackCount++;
  }
  if (raw.length === 0) {
    summary.durationMs = Date.now() - start;
    return summary;
  }

  // One updatedAt + staleAfter for the whole batch. Per-row variance
  // arrives in 3.0.5 when the on-demand UI consumer updates single rows
  // out of band — bulk-refresh rows still expire together.
  const updatedAt = new Date();
  const staleAfter = new Date(updatedAt.getTime() + STALE_AFTER_TTL_MS);
  const rows = raw.map((r) => ({
    typeId: r.typeId,
    bestBuy: r.bestBuy,
    bestSell: r.bestSell,
    pct5Buy: r.pct5Buy,
    pct5Sell: r.pct5Sell,
    buyVolume: r.buyVolume,
    sellVolume: r.sellVolume,
    buyDepth: r.buyDepth,
    sellDepth: r.sellDepth,
    updatedAt,
    staleAfter,
    source: r.source,
  }));

  // Chunked upsert: 12 columns × the full ~6,000-type tracked set would push a
  // single multi-row insert past Postgres's 65,535 bind-parameter ceiling — the
  // two depth columns added in migration 0022 are what crossed it (10 cols used
  // to fit). Batch like seedTrackedTypes (sde-pipeline.ts): 1,000 rows × 12 cols
  // = 12k params per call. A ≤1,000-row refresh (the on-view path) stays one insert.
  //
  // Splitting the insert trades whole-batch atomicity for staying under the wire
  // limit, which is safe here: each row is an independent, idempotent price with
  // its own staleness, so a mid-loop failure that persists earlier batches just
  // leaves some rows fresher than others (the normal steady state) and self-heals
  // on the next refresh. A surrounding transaction is NOT an option — the same
  // upsert runs on the neon-http request path (on-view refresh), and that driver
  // has no interactive-transaction support. On failure the await rejects and this
  // function throws before `summary.written` is set, so no caller reads a partial count.
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: marketPrices.typeId,
        set: {
          bestBuy: excluded('best_buy'),
          bestSell: excluded('best_sell'),
          pct5Buy: excluded('pct5_buy'),
          pct5Sell: excluded('pct5_sell'),
          buyVolume: excluded('buy_volume'),
          sellVolume: excluded('sell_volume'),
          buyDepth: excluded('buy_depth'),
          sellDepth: excluded('sell_depth'),
          updatedAt: excluded('updated_at'),
          staleAfter: excluded('stale_after'),
          source: excluded('source'),
        },
      });
  }

  summary.written = rows.length;
  summary.durationMs = Date.now() - start;
  return summary;
}
