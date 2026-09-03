import { inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db';
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
    let inner = out.get(r.solarSystemId);
    if (!inner) {
      inner = new Map();
      out.set(r.solarSystemId, inner);
    }
    inner.set(r.activity as IndustryActivity, r.costIndex);
  }
  return out;
}

export async function getSystemCostIndices(systemId: number): Promise<SystemCostIndices> {
  const batch = await getSystemCostIndicesBatch([systemId]);
  return batch.get(systemId) ?? new Map();
}

export async function getAdjustedPrices(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map();
  const rows = await defaultDb
    .select({ typeId: adjustedPrices.typeId, adjustedPrice: adjustedPrices.adjustedPrice })
    .from(adjustedPrices)
    .where(inArray(adjustedPrices.typeId, typeIds));

  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.adjustedPrice !== null) out.set(r.typeId, r.adjustedPrice);
  }
  return out;
}

export async function getAdjustedPrice(typeId: number): Promise<number | null> {
  const prices = await getAdjustedPrices([typeId]);
  return prices.get(typeId) ?? null;
}
