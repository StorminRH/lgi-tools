import { sql } from 'drizzle-orm';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { AnyPgDb } from '@/lib/db-types';
import { excluded, excludedSet } from '@/lib/db-upsert';
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

/**
 * NULL-priced rows with epoch staleness, the same shape the SDE pipeline seeds for tracked types, so the
 * nightly bulk sweep prices newly seen types overnight. Existing rows are never touched.
 */
export async function seedPlaceholderPrices(db: AnyPgDb, typeIds: number[]): Promise<number> {
  if (typeIds.length === 0) return 0;
  const updatedAt = new Date();
  const written = await db
    .insert(marketPrices)
    .values(
      typeIds.map((typeId) => ({ typeId, updatedAt, staleAfter: new Date(0), source: 'esi' })),
    )
    .onConflictDoNothing()
    .returning({ typeId: marketPrices.typeId });
  return written.length;
}

export async function persistPrices(
  db: AnyPgDb,
  raw: RawMarketPrice[],
  meta?: { requested?: number; budgetExhausted?: boolean; fetchedAtByType?: ReadonlyMap<number, Date> },
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

  const now = new Date();
  const rows = raw.map((r) => {
    const updatedAt = meta?.fetchedAtByType?.get(r.typeId) ?? now;
    return {
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
      staleAfter: new Date(updatedAt.getTime() + MARKET_PRICES_FRESHNESS.ttlMs),
      source: r.source,
    };
  });

  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const written = await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: marketPrices.typeId,
        set: excludedSet(marketPrices, [
          'bestBuy',
          'bestSell',
          'pct5Buy',
          'pct5Sell',
          'buyVolume',
          'sellVolume',
          'buyDepth',
          'sellDepth',
          'regionalDiscount',
          'updatedAt',
          'staleAfter',
          'source',
        ]),
        setWhere: sql`${marketPrices.updatedAt} <= ${excluded(marketPrices.updatedAt)}`,
      })
      .returning({ typeId: marketPrices.typeId });
    summary.written += written.length;
  }

  summary.durationMs = Date.now() - start;
  return summary;
}
