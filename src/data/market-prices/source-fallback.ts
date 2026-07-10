import { z } from 'zod';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { chunk, dedupe } from '@/lib/array';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { JITA_44_STATION_ID } from './constants';
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

// Comma-joined IDs go in the URL. 150 keeps the URL under ~1.1KB
// even at 6-digit type IDs — well under the 2KB safe-URL threshold.
const MAX_BATCH = 150;

// Fuzzwork's aggregates response shape. Numbers come back as stringified
// decimals — EXCEPT on a side with zero orders, where every field is a
// plain numeric 0 (observed live on station-scoped aggregates, where empty
// sides are common; 2026-07-10 parity probe). Coerce so both shapes pass
// the boundary; `parseVolume`/`normalize` parse the string form. Boundary
// schema: the documented per-side fields are all required, keyed by type ID.
// Exported for testing.
const fuzzworkSideSchema = z.object({
  weightedAverage: z.coerce.string(),
  max: z.coerce.string(),
  min: z.coerce.string(),
  stddev: z.coerce.string(),
  median: z.coerce.string(),
  volume: z.coerce.string(),
  orderCount: z.coerce.string(),
  percentile: z.coerce.string(),
});

// Exported for testing.
const fuzzworkPairSchema = z.object({
  buy: fuzzworkSideSchema,
  sell: fuzzworkSideSchema,
});

const fuzzworkResponseSchema = z.record(z.string(), fuzzworkPairSchema);

export type FuzzworkSide = z.infer<typeof fuzzworkSideSchema>;
export type FuzzworkPair = z.infer<typeof fuzzworkPairSchema>;
type FuzzworkResponse = z.infer<typeof fuzzworkResponseSchema>;

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
    // Fuzzwork serves aggregates, not an order book — no near-touch depth
    // and no regional-discount fold.
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
    source: 'fuzzwork',
  };
}

async function fetchOneBatch(typeIds: number[]): Promise<RawMarketPrice[]> {
  // Station-scoped (3.7.26.1): both sources must describe the same Jita 4-4
  // book, or prices would flap between semantics on every fallback. Their
  // station buy aggregates are station-local bids — the same ruled buy scope
  // as ours (verified in the 2026-07-10 parity probe).
  const url = `${FUZZWORK_AGGREGATES}?station=${JITA_44_STATION_ID}&types=${typeIds.join(',')}`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': OUTBOUND_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `Fuzzwork aggregates request failed: ${res.status} ${res.statusText}`,
    );
  }
  // Validate at the boundary. A malformed body throws here the same way an
  // HTTP error does above — Fuzzwork is the fallback target, so the throw
  // propagates exactly as a Fuzzwork outage does today.
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
