import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import type { RawMarketPrice } from './types';

// Fuzzwork fallback path. Retained as a circuit-breaker target for the ESI
// source in source.ts: if ESI bulk returns 5xx or the per-type calls fail,
// the dispatcher reaches into this file for one batch round-trip and rewrites
// the source attribution to 'fuzzwork-fallback' on the way out.
//
// This file is intentionally self-contained — the dispatcher in source.ts is
// the only consumer. When Fuzzwork is eventually retired, the entire file
// (and source-fallback.test.ts) deletes cleanly.
const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';

// Jita 4-4 region.
const REGION_ID = 10000002;

// Comma-joined IDs go in the URL. 150 keeps the URL under ~1.1KB
// even at 6-digit type IDs — well under the 2KB safe-URL threshold.
const MAX_BATCH = 150;

// Fuzzwork's aggregates response shape. Numbers come back as
// stringified decimals; we coerce in `parseSide`.
// Exported for testing.
export interface FuzzworkSide {
  weightedAverage: string;
  max: string;
  min: string;
  stddev: string;
  median: string;
  volume: string;
  orderCount: string;
  percentile: string;
}

// Exported for testing.
export interface FuzzworkPair {
  buy: FuzzworkSide;
  sell: FuzzworkSide;
}

type FuzzworkResponse = Record<string, FuzzworkPair>;

function dedupe(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Fuzzwork volumes are decimal strings (e.g. "1234567.0"); truncate before
// BigInt() so we don't blow up on the fractional part. Floor (not round)
// matches the "this many units are actually for sale" intent.
//
// Scientific-notation fallback ("1.5e6") wasn't observed in any Fuzzwork
// response when this slice was first written, but `BigInt("1.5e6")` throws
// SyntaxError — one such row would fail the entire refresh batch. The
// `Number(raw)` path floors correctly for any finite value and only loses
// precision above Number.MAX_SAFE_INTEGER (~9 quadrillion), well past any
// realistic Jita market volume.
// Exported for testing.
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

// Buy side: "best" is the *highest* bid (`max`). Sell side: "best"
// is the *lowest* ask (`min`). Both percentiles read the 5% column.
// `orderCount == 0` on either side → NULL for that side's columns.
//
// Source attribution is 'fuzzwork' here. The dispatcher in source.ts
// rewrites to 'fuzzwork-fallback' when calling this as a circuit-breaker
// target.
// Exported for testing.
export function normalize(typeId: number, pair: FuzzworkPair): RawMarketPrice {
  const buy = pair.buy;
  const sell = pair.sell;
  const buyOrderCount = Number.parseInt(buy.orderCount, 10);
  const sellOrderCount = Number.parseInt(sell.orderCount, 10);
  return {
    typeId,
    bestBuy: buyOrderCount > 0 ? Number.parseFloat(buy.max) : null,
    pct5Buy: buyOrderCount > 0 ? Number.parseFloat(buy.percentile) : null,
    bestSell: sellOrderCount > 0 ? Number.parseFloat(sell.min) : null,
    pct5Sell: sellOrderCount > 0 ? Number.parseFloat(sell.percentile) : null,
    buyVolume: buyOrderCount > 0 ? parseVolume(buy.volume) : null,
    sellVolume: sellOrderCount > 0 ? parseVolume(sell.volume) : null,
    source: 'fuzzwork',
  };
}

async function fetchOneBatch(typeIds: number[]): Promise<RawMarketPrice[]> {
  const url = `${FUZZWORK_AGGREGATES}?region=${REGION_ID}&types=${typeIds.join(',')}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': OUTBOUND_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `Fuzzwork aggregates request failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as FuzzworkResponse;
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
