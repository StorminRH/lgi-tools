import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { STALE_AFTER_TTL_MS } from './constants';
import { marketPrices } from './schema';
import { fetchPricesFromSource } from './source';

export interface RefreshSummary {
  requested: number;
  fetched: number;
  written: number;
  durationMs: number;
}

// EXCLUDED is the proposed-but-conflicted row inside ON CONFLICT.
function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// Accept either the strict default schema (CLI's `drizzle(client)`) or the
// lazy proxy from `@/db` (which infers a wider generic). Same wrinkle as
// cache.ts — callers shouldn't have to know which one they're holding.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

export async function refreshPrices(
  db: AnyPgDb,
  typeIds: number[],
): Promise<RefreshSummary> {
  const start = Date.now();
  const summary: RefreshSummary = {
    requested: typeIds.length,
    fetched: 0,
    written: 0,
    durationMs: 0,
  };

  if (typeIds.length === 0) {
    summary.durationMs = Date.now() - start;
    return summary;
  }

  const raw = await fetchPricesFromSource(typeIds);
  summary.fetched = raw.length;
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
    updatedAt,
    staleAfter,
    source: r.source,
  }));

  await db
    .insert(marketPrices)
    .values(rows)
    .onConflictDoUpdate({
      target: marketPrices.typeId,
      set: {
        bestBuy: excluded('best_buy'),
        bestSell: excluded('best_sell'),
        pct5Buy: excluded('pct5_buy'),
        pct5Sell: excluded('pct5_sell'),
        buyVolume: excluded('buy_volume'),
        sellVolume: excluded('sell_volume'),
        updatedAt: excluded('updated_at'),
        staleAfter: excluded('stale_after'),
        source: excluded('source'),
      },
    });

  summary.written = rows.length;
  summary.durationMs = Date.now() - start;
  return summary;
}
