import { inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db';
import type { IndustryActivity } from './constants';
import { adjustedPrices, industryCostIndices } from './schema';
import type { SystemCostIndices } from './types';

// Request-path reads over the two daily datasets, on the `@/db` proxy (the
// getPrices idiom). Empty input short-circuits without a round trip.

// Cost indices for a set of systems, as Map<systemId, Map<activity, index>>.
// One IN(...) query; pivoted in JS. `activity` is a free text column narrowed
// to the IndustryActivity union (only the union's literals are ever written).
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

// Cost indices for one system. Empty map when the system has no stored row.
export async function getSystemCostIndices(systemId: number): Promise<SystemCostIndices> {
  const batch = await getSystemCostIndicesBatch([systemId]);
  return batch.get(systemId) ?? new Map();
}

// Adjusted prices for a set of types, as Map<typeId, adjustedPrice>. Types with
// no row, or a stored NULL price (absent in the source), are omitted — a key's
// presence means a usable adjusted price.
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

// Adjusted price for one type. null when there's no row or no usable price.
export async function getAdjustedPrice(typeId: number): Promise<number | null> {
  const prices = await getAdjustedPrices([typeId]);
  return prices.get(typeId) ?? null;
}
