import { z } from 'zod';
import { EsiContractError, EsiServerError, esiFetch, esiUrl } from '@/lib/esi';
import { INDUSTRY_ACTIVITIES, type IndustryActivity } from './constants';
import type { RawAdjustedPrice, RawCostIndex } from './types';

// ESI source for the two daily industry datasets. Both endpoints return the
// full dataset in a single (un-paginated) response, so each is one gated GET.
// All calls go through the shared ESI gate (esiFetch/esiUrl) — it injects the
// User-Agent + pinned X-Compatibility-Date, tracks the shared budget, and
// fails closed for non-interactive callers like this cron. The gate throws on
// 5xx/420; a 4xx passes through as a non-ok Response, which we turn into an
// EsiServerError so the ingest layer treats it like any other fetch failure.
//
// Both bodies (~1.9 MB indices, ~1.1 MB prices) far exceed the gate's 128 KB
// ETag-cache cap, so nothing is cached and there are no 304s to reason about.

const KNOWN_ACTIVITIES = new Set<string>(INDUSTRY_ACTIVITIES);

function isIndustryActivity(s: string): s is IndustryActivity {
  return KNOWN_ACTIVITIES.has(s);
}

// Boundary schema for GET /industry/systems/. Consumed fields only: ESI sends
// more keys, z.object strips them. `activity` is validated as a plain string
// (structure only) and narrowed to the known set when flattening — so a future
// CCP activity we don't model is dropped, not a parse failure that would take
// the whole dataset down.
const costIndicesBodySchema = z.array(
  z.object({
    solar_system_id: z.number(),
    cost_indices: z.array(
      z.object({ activity: z.string(), cost_index: z.number() }),
    ),
  }),
);

// Boundary schema for GET /markets/prices/. adjusted_price is optional per the
// ESI spec; absent → null (distinct from a real 0.0). average_price rides the
// same endpoint but is unconsumed, so z.object strips it.
const adjustedPricesBodySchema = z.array(
  z.object({
    type_id: z.number(),
    adjusted_price: z.number().optional(),
  }),
);

/**
 * Flatten the nested per-system shape into one RawCostIndex per known activity.
 * Exported for direct unit testing of the parse/flatten path.
 */
export function parseCostIndices(body: unknown): RawCostIndex[] {
  const result = costIndicesBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  const out: RawCostIndex[] = [];
  for (const system of result.data) {
    for (const entry of system.cost_indices) {
      if (!isIndustryActivity(entry.activity)) continue;
      out.push({
        solarSystemId: system.solar_system_id,
        activity: entry.activity,
        costIndex: entry.cost_index,
      });
    }
  }
  return out;
}

/** Exported for direct unit testing of the parse path. */
export function parseAdjustedPrices(body: unknown): RawAdjustedPrice[] {
  const result = adjustedPricesBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data.map((r) => ({
    typeId: r.type_id,
    adjustedPrice: r.adjusted_price ?? null,
  }));
}

/** Fetches current ESI industry cost indices through the shared public dispatch gate. */
export async function fetchCostIndices(): Promise<RawCostIndex[]> {
  const res = await esiFetch(esiUrl('/industry/systems/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseCostIndices(await res.json());
}

/** Fetches current ESI adjusted prices through the shared public dispatch gate. */
export async function fetchAdjustedPrices(): Promise<RawAdjustedPrice[]> {
  const res = await esiFetch(esiUrl('/markets/prices/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseAdjustedPrices(await res.json());
}
