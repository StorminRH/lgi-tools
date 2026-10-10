import { sql } from 'drizzle-orm';
import { chunk } from '@/lib/array';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { AnyPgDb } from '@/lib/db-types';
import { excluded, excludedSet } from '@/lib/db-upsert';
import { marketPrices } from './schema';
import { fetchPricesFromSource } from './source';
import type { RawMarketPrice } from './types';

const MARKET_PRICES_FRESHNESS = freshnessGate('market_prices');
/** Rows per market_prices insert: 13 binds a row for a priced upsert, far below the bind-parameter cap. */
const INSERT_BATCH = 1000;

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
 * NULL-priced rows with epoch staleness and source 'esi', so the nightly bulk sweep prices newly seen
 * types overnight. The SDE pipeline seeds every tracked type through here and the board seeds unpriced
 * owned types. Existing rows are never touched; returns how many rows this call inserted.
 */
export async function seedPlaceholderPrices(db: AnyPgDb, typeIds: readonly number[]): Promise<number> {
  const updatedAt = new Date();
  const staleAfter = new Date(0);
  let inserted = 0;
  for (const batch of chunk(typeIds, INSERT_BATCH)) {
    const written = await db
      .insert(marketPrices)
      .values(batch.map((typeId) => ({ typeId, updatedAt, staleAfter, source: 'esi' as const })))
      .onConflictDoNothing()
      .returning({ typeId: marketPrices.typeId });
    inserted += written.length;
  }
  return inserted;
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

  for (const batch of chunk(rows, INSERT_BATCH)) {
    const written = await db
      .insert(marketPrices)
      .values(batch)
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
