import { inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db';
import { getOrInsertComputed } from '@/lib/array';
import type { IndustryActivity } from './constants';
import { adjustedPrices, industryCostIndices } from './schema';
import type { SystemCostIndices } from './types';

export async function getSystemCostIndicesBatch(
  systemIds: number[],
): Promise<Map<number, SystemCostIndices>> {
  if (systemIds.length === 0) return new Map();
  const rows = await defaultDb
    .select({
      solarSystemId: industryCostIndices.solarSystemId,
      activity: industryCostIndices.activity,
      costIndex: industryCostIndices.costIndex,
    })
    .from(industryCostIndices)
    .where(inArray(industryCostIndices.solarSystemId, systemIds));

  const out = new Map<number, Map<IndustryActivity, number>>();
  for (const r of rows) {
    getOrInsertComputed(out, r.solarSystemId, () => new Map()).set(r.activity as IndustryActivity, r.costIndex);
  }
  return out;
}

export async function getSystemCostIndices(systemId: number): Promise<SystemCostIndices> {
  const batch = await getSystemCostIndicesBatch([systemId]);
  return batch.get(systemId) ?? new Map();
}

/** One IN read of a nullable price column; NULL rows are dropped, 0 is kept as a real price. */
async function readPriceColumn(
  typeIds: number[],
  column: 'adjustedPrice' | 'averagePrice',
): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map();
  const rows = await defaultDb
    .select({ typeId: adjustedPrices.typeId, price: adjustedPrices[column] })
    .from(adjustedPrices)
    .where(inArray(adjustedPrices.typeId, typeIds));

  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.price !== null) out.set(r.typeId, r.price);
  }
  return out;
}

export function getAdjustedPrices(typeIds: number[]): Promise<Map<number, number>> {
  return readPriceColumn(typeIds, 'adjustedPrice');
}

/** CCP's rolling average per type; types without one are absent. */
export function getAveragePrices(typeIds: number[]): Promise<Map<number, number>> {
  return readPriceColumn(typeIds, 'averagePrice');
}
