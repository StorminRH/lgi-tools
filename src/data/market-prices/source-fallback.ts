import { z } from 'zod';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { chunk, dedupe } from '@/lib/array';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { applySpreadFloorToBuyFigures } from './book-math';
import { JITA_44_STATION_ID } from './constants';
import type { RawMarketPrice } from './types';

const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';

const MAX_BATCH = 150;

const fuzzworkFieldSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((value) => value.trim() !== '' && Number.isFinite(Number(value)), {
    message: 'Expected a finite numeric aggregate field',
  });

const fuzzworkSideSchema = z.object({
  weightedAverage: fuzzworkFieldSchema,
  max: fuzzworkFieldSchema,
  min: fuzzworkFieldSchema,
  stddev: fuzzworkFieldSchema,
  median: fuzzworkFieldSchema,
  volume: fuzzworkFieldSchema,
  orderCount: fuzzworkFieldSchema,
  percentile: fuzzworkFieldSchema,
});

const fuzzworkPairSchema = z.object({
  buy: fuzzworkSideSchema,
  sell: fuzzworkSideSchema,
});

const fuzzworkResponseSchema = z.record(z.string(), fuzzworkPairSchema);

export type FuzzworkSide = z.infer<typeof fuzzworkSideSchema>;
export type FuzzworkPair = z.infer<typeof fuzzworkPairSchema>;
type FuzzworkResponse = z.infer<typeof fuzzworkResponseSchema>;

export function parseVolume(raw: string): bigint {
  if (!raw) return BigInt(0);
  if (/[eE]/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return BigInt(0);
    return BigInt(Math.floor(n));
  }
  const dot = raw.indexOf('.');
  const intPart = dot >= 0 ? raw.slice(0, dot) : raw;
  return BigInt(intPart || '0');
}

export function normalize(typeId: number, pair: FuzzworkPair): RawMarketPrice {
  const buy = pair.buy;
  const sell = pair.sell;
  const buyOrderCount = Number.parseInt(buy.orderCount, 10);
  const sellOrderCount = Number.parseInt(sell.orderCount, 10);
  const bestSell = sellOrderCount > 0 ? Number.parseFloat(sell.min) : null;
  const floored = applySpreadFloorToBuyFigures(
    {
      bestBuy: buyOrderCount > 0 ? Number.parseFloat(buy.max) : null,
      pct5Buy: buyOrderCount > 0 ? Number.parseFloat(buy.percentile) : null,
      buyVolume: buyOrderCount > 0 ? parseVolume(buy.volume) : null,
    },
    bestSell,
  );
  return {
    typeId,
    bestBuy: floored.bestBuy,
    pct5Buy: floored.pct5Buy,
    bestSell,
    pct5Sell: sellOrderCount > 0 ? Number.parseFloat(sell.percentile) : null,
    buyVolume: floored.buyVolume,
    sellVolume: sellOrderCount > 0 ? parseVolume(sell.volume) : null,
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
    source: 'fuzzwork',
  };
}

async function fetchOneBatch(typeIds: number[]): Promise<RawMarketPrice[]> {
  const url = `${FUZZWORK_AGGREGATES}?station=${JITA_44_STATION_ID}&types=${typeIds.join(',')}`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': OUTBOUND_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `Fuzzwork aggregates request failed: ${res.status} ${res.statusText}`,
    );
  }
  const parsed = fuzzworkResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error('Fuzzwork aggregates response failed boundary validation');
  }
  const body: FuzzworkResponse = parsed.data;
  const out: RawMarketPrice[] = [];
  for (const id of typeIds) {
    const pair = body[String(id)];
    if (!pair) continue;
    out.push(normalize(id, pair));
  }
  return out;
}

export async function fetchPricesFromFuzzwork(
  typeIds: number[],
): Promise<RawMarketPrice[]> {
  if (typeIds.length === 0) return [];
  const unique = dedupe(typeIds);
  const batches = chunk(unique, MAX_BATCH);
  const results: RawMarketPrice[] = [];
  for (const batch of batches) {
    const part = await fetchOneBatch(batch);
    results.push(...part);
  }
  return results;
}
