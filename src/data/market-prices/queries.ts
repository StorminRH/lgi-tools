import { inArray, lt, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db';
import { marketPrices } from './schema';
import type { MarketPrice, PriceSource } from './types';
import type { AnyPgDb } from '@/lib/db-types';

const PRICE_COLUMNS = {
  typeId: marketPrices.typeId,
  bestBuy: marketPrices.bestBuy,
  bestSell: marketPrices.bestSell,
  pct5Buy: marketPrices.pct5Buy,
  pct5Sell: marketPrices.pct5Sell,
  buyVolume: marketPrices.buyVolume,
  sellVolume: marketPrices.sellVolume,
  buyDepth: marketPrices.buyDepth,
  sellDepth: marketPrices.sellDepth,
  regionalDiscount: marketPrices.regionalDiscount,
  source: marketPrices.source,
  updatedAt: marketPrices.updatedAt,
  staleAfter: marketPrices.staleAfter,
} as const;

export async function getPrices(
  typeIds: number[],
): Promise<Map<number, MarketPrice>> {
  if (typeIds.length === 0) return new Map();
  const rows = await defaultDb
    .select(PRICE_COLUMNS)
    .from(marketPrices)
    .where(inArray(marketPrices.typeId, typeIds));
  const out = new Map<number, MarketPrice>();
  for (const r of rows) out.set(r.typeId, { ...r, source: r.source as PriceSource });
  return out;
}

export async function listStaleTypeIds(db: AnyPgDb): Promise<number[]> {
  const rows = await db
    .select({ typeId: marketPrices.typeId })
    .from(marketPrices)
    .where(lt(marketPrices.staleAfter, sql`NOW()`));
  return rows.map((r) => r.typeId);
}

export async function listMissingTypeIds(
  db: AnyPgDb,
  expected: number[],
): Promise<number[]> {
  if (expected.length === 0) return [];
  const present = await db
    .select({ typeId: marketPrices.typeId })
    .from(marketPrices)
    .where(inArray(marketPrices.typeId, expected));
  const presentSet = new Set(present.map((r) => r.typeId));
  return expected.filter((id) => !presentSet.has(id));
}
