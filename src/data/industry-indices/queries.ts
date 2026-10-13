import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { storedExpiry, untilExpires } from '@/data/esi-store';
import { db as defaultDb } from '@/db';
import { dedupe } from '@/lib/array';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import type { IndustryActivity } from './constants';
import { COST_INDICES_KEY, INDUSTRY_INDICES_TAG } from './keys';
import { adjustedPrices, industryCostIndices } from './schema';
import type { SystemCostIndices } from './types';

async function readSystemCostIndexRows(systemId: number): Promise<SystemCostIndices | null> {
  const rows = await defaultDb
    .select({ activity: industryCostIndices.activity, costIndex: industryCostIndices.costIndex })
    .from(industryCostIndices)
    .where(eq(industryCostIndices.solarSystemId, systemId));
  if (rows.length === 0) return null;
  return new Map(rows.map((r) => [r.activity as IndustryActivity, r.costIndex]));
}

/**
 * One system's cost indices, cached across instances until CCP's copy of
 * the whole document expires; the on-view refresh clears the tag when a
 * 200 lands. A system with no stored indices is absent, not empty.
 */
async function getSystemCostIndices(systemId: number): Promise<SystemCostIndices | null> {
  'use cache: remote';
  cacheTag(INDUSTRY_INDICES_TAG);
  const [indices, expiresAt] = await Promise.all([readSystemCostIndexRows(systemId), storedExpiry([COST_INDICES_KEY])]);
  cacheLife(untilExpires(expiresAt));
  return indices;
}

export async function getSystemCostIndicesBatch(
  systemIds: number[],
): Promise<Map<number, SystemCostIndices>> {
  return mapByIdDroppingNulls(dedupe(systemIds), getSystemCostIndices);
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
