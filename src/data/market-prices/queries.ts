import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { marketPrices } from '@/db/schema';
import type { MarketPrice } from './types';

const PRICE_COLUMNS = {
  typeId: marketPrices.typeId,
  bestBuy: marketPrices.bestBuy,
  bestSell: marketPrices.bestSell,
  pct5Buy: marketPrices.pct5Buy,
  pct5Sell: marketPrices.pct5Sell,
  updatedAt: marketPrices.updatedAt,
} as const;

export async function getPrices(
  typeIds: number[],
): Promise<Map<number, MarketPrice>> {
  if (typeIds.length === 0) return new Map();
  const rows = await db
    .select(PRICE_COLUMNS)
    .from(marketPrices)
    .where(inArray(marketPrices.typeId, typeIds));
  const out = new Map<number, MarketPrice>();
  for (const r of rows) out.set(r.typeId, r);
  return out;
}
