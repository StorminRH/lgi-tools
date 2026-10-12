import { z } from 'zod';
import { fetchStored, type EsiResponseMeta, type EsiStoreKey } from '@/data/esi-store';
import { EsiContractError, EsiServerError } from '@/platform/esi';
import { INDUSTRY_ACTIVITIES, type IndustryActivity } from './constants';
import { ADJUSTED_PRICES_KEY, COST_INDICES_KEY } from './keys';
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
    average_price: z.number().optional(),
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
    averagePrice: r.average_price ?? null,
  }));
}

/** A dataset read through the store: nothing new, or the parsed rows with the meta to commit after they are written. */
export type SourceRead<T> =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'fresh'; readonly rows: T[]; readonly meta: EsiResponseMeta };

/**
 * One global dataset through the store: unexpired, a 304 and a busy
 * single-flight lock all come back unchanged, and a status that is neither
 * 200 nor 304 is the error it always was.
 */
async function readDataset<T>(key: EsiStoreKey, parse: (body: unknown) => T[]): Promise<SourceRead<T>> {
  const result = await fetchStored(key);
  if (result.kind === 'unchanged') return { kind: 'unchanged' };
  if (result.kind === 'error') throw new EsiServerError(result.status);
  return { kind: 'fresh', rows: parse(await result.res.json()), meta: result.meta };
}

export function fetchCostIndices(): Promise<SourceRead<RawCostIndex>> {
  return readDataset(COST_INDICES_KEY, parseCostIndices);
}

export function fetchAdjustedPrices(): Promise<SourceRead<RawAdjustedPrice>> {
  return readDataset(ADJUSTED_PRICES_KEY, parseAdjustedPrices);
}
