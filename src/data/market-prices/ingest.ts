import { sql } from 'drizzle-orm';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { AnyPgDb } from '@/lib/db-types';
import { marketPrices } from './schema';
import { fetchPricesFromSource } from './source';
import type { RawMarketPrice } from './types';

const MARKET_PRICES_FRESHNESS = freshnessGate('market_prices');

export interface RefreshSummary {
  requested: number;
  fetched: number;
  written: number;
  durationMs: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

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

  const updatedAt = new Date();
  const staleAfter = new Date(
    updatedAt.getTime() + MARKET_PRICES_FRESHNESS.ttlMs,
  );
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
    regionalDiscount: r.regionalDiscount ?? null,
    updatedAt,
    staleAfter,
    source: r.source,
  }));

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
          regionalDiscount: excluded('regional_discount'),
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
