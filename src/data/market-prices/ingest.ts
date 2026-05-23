import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
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

export async function refreshPrices(
  db: PostgresJsDatabase,
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

  // One timestamp for the whole batch — Session D's cache uses
  // MAX(updated_at) and per-row jitter would muddy that signal.
  const updatedAt = new Date();
  const rows = raw.map((r) => ({
    typeId: r.typeId,
    bestBuy: r.bestBuy,
    bestSell: r.bestSell,
    pct5Buy: r.pct5Buy,
    pct5Sell: r.pct5Sell,
    updatedAt,
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
        updatedAt: excluded('updated_at'),
      },
    });

  summary.written = rows.length;
  summary.durationMs = Date.now() - start;
  return summary;
}
