import { z } from 'zod';
import { EsiContractError, EsiServerError, esiFetch, esiUrl } from '@/platform/esi';
import { INDUSTRY_ACTIVITIES, type IndustryActivity } from './constants';
import type { RawAdjustedPrice, RawCostIndex } from './types';

const KNOWN_ACTIVITIES = new Set<string>(INDUSTRY_ACTIVITIES);

function isIndustryActivity(s: string): s is IndustryActivity {
  return KNOWN_ACTIVITIES.has(s);
}

const costIndicesBodySchema = z.array(
  z.object({
    solar_system_id: z.number(),
    cost_indices: z.array(
      z.object({ activity: z.string(), cost_index: z.number() }),
    ),
  }),
);

const adjustedPricesBodySchema = z.array(
  z.object({
    type_id: z.number(),
    adjusted_price: z.number().optional(),
  }),
);

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

export function parseAdjustedPrices(body: unknown): RawAdjustedPrice[] {
  const result = adjustedPricesBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data.map((r) => ({
    typeId: r.type_id,
    adjustedPrice: r.adjusted_price ?? null,
  }));
}

export async function fetchCostIndices(): Promise<RawCostIndex[]> {
  const res = await esiFetch(esiUrl('/industry/systems/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseCostIndices(await res.json());
}

export async function fetchAdjustedPrices(): Promise<RawAdjustedPrice[]> {
  const res = await esiFetch(esiUrl('/markets/prices/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseAdjustedPrices(await res.json());
}
