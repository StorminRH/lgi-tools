import { z } from 'zod';
import {
  BULK_THRESHOLD,
  ESI_BASE_URL,
  ESI_REGION_ID_FORGE,
  PAGE_CONCURRENCY,
  PER_TYPE_CONCURRENCY,
} from './constants';
import {
  EsiBudgetExhaustedError,
  EsiContractError,
  EsiServerError,
  esiFetch,
} from './esi-budget';
import { dedupe } from '@/lib/array';
import { fetchPricesFromFuzzwork } from './source-fallback';
import type { RawMarketPrice } from './types';

// ESI source dispatcher. Above BULK_THRESHOLD types stale at once, the
// region-dump path streams every order in The Forge and filters in memory.
// Below the threshold, per-type calls are cheaper. Either way, a Fuzzwork
// fallback covers ESI degradation — preserving the per-row staleness
// contract so the next cron tick gets a fresh attempt.

// ESI's /markets/{region}/orders/ response item shape — only the fields
// we actually use. Boundary schema: ESI sends more keys; z.object ignores
// the unknown ones, so an upstream addition can't break parsing, but a
// changed/missing consumed field rejects the body at the boundary.
const esiOrderSchema = z.object({
  type_id: z.number(),
  is_buy_order: z.boolean(),
  price: z.number(),
  volume_remain: z.number(),
});
const esiOrdersSchema = z.array(esiOrderSchema);

type EsiOrder = z.infer<typeof esiOrderSchema>;

// Validate a parsed-JSON ESI orders body, throwing EsiContractError on a
// shape mismatch so callers route to Fuzzwork exactly as they do for a 5xx.
function parseEsiOrders(body: unknown): EsiOrder[] {
  const result = esiOrdersSchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data;
}

// Cheap pre-filter for the bulk region dump: skim a raw page down to the
// wanted type set BEFORE Zod runs, so we validate only the handful of orders
// we'll actually keep rather than every order on a ~400-600 page book (most of
// which we discard anyway). A non-array body still throws EsiContractError, the
// same routing-to-Fuzzwork signal parseEsiOrders gives. Page 1 keeps the full
// parse as the boundary shape probe; tracked types are still fully validated
// here (a malformed order for a wanted type survives the skim and trips Zod).
function filterRawByWantedType(body: unknown, wanted: Set<number>): unknown[] {
  if (!Array.isArray(body)) throw new EsiContractError();
  return body.filter((o) => {
    const typeId = (o as { type_id?: unknown } | null)?.type_id;
    return typeof typeId === 'number' && wanted.has(typeId);
  });
}

interface OrderEntry {
  price: number;
  volume: bigint;
}

interface OrderBucket {
  buyOrders: OrderEntry[];
  sellOrders: OrderEntry[];
}

// Bounded-concurrency worker pool. Workers pull from a shared index until
// the input is exhausted. If any worker throws, a shared `cancelled` flag
// short-circuits the other workers' next iteration — surviving workers
// finish their current item and then exit cleanly, so we don't drain the
// rest of the cursor against a known-failing endpoint. The first thrown
// error is what surfaces to the caller via Promise.all rejection.
//
// Why the flag matters: the region-dump bulk path can have ~500 pages.
// Without cancellation, a single 5xx on page 5 would leave (PAGE_CONCURRENCY
// - 1) = 7 workers draining the remaining ~495 pages — each call burning
// outbound bandwidth and ESI error budget toward the floor. The flag caps
// post-throw dispatch at one extra item per surviving worker.
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  let cancelled = false;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        if (cancelled) return;
        const i = cursor++;
        if (i >= items.length) return;
        try {
          await worker(items[i]);
        } catch (err) {
          cancelled = true;
          throw err;
        }
      }
    },
  );
  await Promise.all(workers);
}

// Funnel ESI orders into per-type buckets, ignoring types we didn't ask
// about. Mutates `buckets` in place. The region-dump path calls this once
// per page; the per-type path passes the whole response as one "page."
function absorbOrders(
  orders: EsiOrder[],
  wanted: Set<number>,
  buckets: Map<number, OrderBucket>,
): void {
  for (const o of orders) {
    if (!wanted.has(o.type_id)) continue;
    let bucket = buckets.get(o.type_id);
    if (!bucket) {
      bucket = { buyOrders: [], sellOrders: [] };
      buckets.set(o.type_id, bucket);
    }
    const entry: OrderEntry = {
      price: o.price,
      volume: BigInt(o.volume_remain),
    };
    if (o.is_buy_order) bucket.buyOrders.push(entry);
    else bucket.sellOrders.push(entry);
  }
}

// 5%-percentile — the volume-weighted average price of the cheapest 5%
// of side volume (Fuzzwork's definition; we match it so wormhole-sites
// ISK totals don't drift when the source swaps). Buy side sorts
// descending (best bid first); sell side sorts ascending (best ask first).
// Walk the sorted list, accumulating price × units_taken until 5% of
// total side volume is consumed; divide to get the average. Empty side
// returns nulls; zero-volume side returns best for pct5.
//
// Exported for testing — the math is delicate enough that a direct
// regression test is worth the extra surface.
export function computeSide(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
): { best: number | null; pct5: number | null; volume: bigint | null } {
  if (orders.length === 0) {
    return { best: null, pct5: null, volume: null };
  }
  const sorted = [...orders].sort((a, b) =>
    direction === 'asc' ? a.price - b.price : b.price - a.price,
  );
  const best = sorted[0].price;

  let totalVolume = BigInt(0);
  for (const o of sorted) totalVolume += o.volume;
  if (totalVolume === BigInt(0)) {
    return { best, pct5: best, volume: BigInt(0) };
  }

  // Threshold = ceil(5% of total volume) — bigint math truncates by
  // default, which on small volumes rounds the threshold down to zero;
  // bump up by one when there's any remainder so a single tiny order
  // still gets sampled.
  const fivePct = totalVolume * BigInt(5);
  const threshold =
    fivePct % BigInt(100) === BigInt(0)
      ? fivePct / BigInt(100)
      : fivePct / BigInt(100) + BigInt(1);

  let used = BigInt(0);
  let weightedSum = 0;
  for (const o of sorted) {
    const remaining = threshold - used;
    if (remaining <= BigInt(0)) break;
    const take = o.volume < remaining ? o.volume : remaining;
    weightedSum += o.price * Number(take);
    used += take;
  }
  const pct5 = used > BigInt(0) ? weightedSum / Number(used) : best;
  return { best, pct5, volume: totalVolume };
}

function bucketToRawPrice(
  typeId: number,
  bucket: OrderBucket,
): RawMarketPrice {
  const buy = computeSide(bucket.buyOrders, 'desc');
  const sell = computeSide(bucket.sellOrders, 'asc');
  return {
    typeId,
    bestBuy: buy.best,
    pct5Buy: buy.pct5,
    bestSell: sell.best,
    pct5Sell: sell.pct5,
    buyVolume: buy.volume,
    sellVolume: sell.volume,
    source: 'esi',
  };
}

// Materialize a row per requested type ID, falling back to an empty bucket
// when ESI returned no orders for that type. Matches Fuzzwork's behavior
// of always emitting a row for every requested type (so stale_after
// advances even for "no orders" types).
function bucketsToRawPrices(
  typeIds: number[],
  buckets: Map<number, OrderBucket>,
): RawMarketPrice[] {
  const emptyBucket: OrderBucket = { buyOrders: [], sellOrders: [] };
  return typeIds.map((typeId) =>
    bucketToRawPrice(typeId, buckets.get(typeId) ?? emptyBucket),
  );
}

function regionDumpPageUrl(page: number): string {
  return `${ESI_BASE_URL}/markets/${ESI_REGION_ID_FORGE}/orders/?order_type=all&page=${page}`;
}

function perTypeUrl(typeId: number): string {
  return `${ESI_BASE_URL}/markets/${ESI_REGION_ID_FORGE}/orders/?type_id=${typeId}&order_type=all`;
}

// Bulk path: stream every order page in The Forge, filter to the requested
// type set in memory. Concurrent across pages with PAGE_CONCURRENCY cap.
// Any 5xx or budget exhaustion aborts the bulk attempt — the dispatcher
// catches and routes to Fuzzwork fallback.
async function fetchViaEsiRegionDump(
  typeIds: number[],
): Promise<RawMarketPrice[]> {
  const wanted = new Set(typeIds);
  const buckets = new Map<number, OrderBucket>();

  // First page synchronously to learn the page count. `esiFetch` only
  // throws on 5xx / 420; 4xx passes through as a non-ok Response whose
  // body is an error object, not an array. Guard explicitly so we throw
  // `EsiServerError` (which the dispatcher catches and routes to Fuzzwork)
  // instead of letting `absorbOrders` trip a TypeError on the non-array.
  const firstRes = await esiFetch(regionDumpPageUrl(1));
  if (!firstRes.ok) throw new EsiServerError(firstRes.status);
  const totalPages = Number(firstRes.headers.get('X-Pages') ?? '1');
  const firstOrders = parseEsiOrders(await firstRes.json());
  absorbOrders(firstOrders, wanted, buckets);

  if (totalPages > 1) {
    const pages: number[] = [];
    for (let p = 2; p <= totalPages; p++) pages.push(p);
    await runConcurrent(pages, PAGE_CONCURRENCY, async (page) => {
      const res = await esiFetch(regionDumpPageUrl(page));
      if (!res.ok) throw new EsiServerError(res.status);
      const orders = parseEsiOrders(filterRawByWantedType(await res.json(), wanted));
      absorbOrders(orders, wanted, buckets);
    });
  }

  return bucketsToRawPrices(typeIds, buckets);
}

// Per-type path: one ESI call per stale type, concurrent with
// PER_TYPE_CONCURRENCY cap. Per-type failures route the affected type to
// the Fuzzwork fallback batch at the end (best-effort). Budget exhaustion
// short-circuits dispatch — remaining types route to Fuzzwork too.
async function fetchViaEsiPerType(
  typeIds: number[],
): Promise<{ prices: RawMarketPrice[]; budgetExhausted: boolean }> {
  const results: RawMarketPrice[] = [];
  const fallbackNeeded: number[] = [];
  let budgetExhausted = false;

  await runConcurrent(typeIds, PER_TYPE_CONCURRENCY, async (typeId) => {
    if (budgetExhausted) {
      fallbackNeeded.push(typeId);
      return;
    }
    try {
      const res = await esiFetch(perTypeUrl(typeId));
      if (!res.ok) {
        // 4xx — invalid type ID or similar. Route to Fuzzwork; if it also
        // returns nothing, the row simply doesn't update (same as today).
        fallbackNeeded.push(typeId);
        return;
      }
      const orders = parseEsiOrders(await res.json());
      const buckets = new Map<number, OrderBucket>();
      absorbOrders(orders, new Set([typeId]), buckets);
      results.push(...bucketsToRawPrices([typeId], buckets));
    } catch (err) {
      if (err instanceof EsiBudgetExhaustedError) {
        budgetExhausted = true;
        fallbackNeeded.push(typeId);
        return;
      }
      // EsiServerError, EsiContractError (malformed body), or any other
      // transient — route to Fuzzwork.
      fallbackNeeded.push(typeId);
    }
  });

  if (fallbackNeeded.length > 0) {
    const fb = await fallbackToFuzzwork(fallbackNeeded);
    results.push(...fb);
  }

  return { prices: results, budgetExhausted };
}

// One Fuzzwork round-trip for the affected types, with source rewritten
// to 'fuzzwork-fallback' on the way out. Keeps source-fallback.ts itself
// emitting the bare 'fuzzwork' literal so a future delete is clean.
async function fallbackToFuzzwork(
  typeIds: number[],
): Promise<RawMarketPrice[]> {
  const raw = await fetchPricesFromFuzzwork(typeIds);
  return raw.map((r) => ({ ...r, source: 'fuzzwork-fallback' as const }));
}

// Returns the priced rows plus a `budgetExhausted` flag — true when ESI's
// error budget was hit (either the pre-dispatch gate or a 420), which forced
// the Fuzzwork fallback. The flag is the one degradation fact callers can't
// reconstruct from the row `source` values alone (a fallback row reads the
// same whether it came from an ESI 5xx or budget exhaustion); the route
// handlers thread it into the O-1 telemetry. The data slice itself never
// imports telemetry — the boundary stays sealed.
export async function fetchPricesFromSource(
  typeIds: number[],
): Promise<{ prices: RawMarketPrice[]; budgetExhausted: boolean }> {
  if (typeIds.length === 0) return { prices: [], budgetExhausted: false };
  const unique = dedupe(typeIds);

  if (unique.length >= BULK_THRESHOLD) {
    try {
      return { prices: await fetchViaEsiRegionDump(unique), budgetExhausted: false };
    } catch (err) {
      if (
        err instanceof EsiBudgetExhaustedError ||
        err instanceof EsiServerError ||
        err instanceof EsiContractError
      ) {
        const prices = await fallbackToFuzzwork(unique);
        return { prices, budgetExhausted: err instanceof EsiBudgetExhaustedError };
      }
      throw err;
    }
  }

  return fetchViaEsiPerType(unique);
}
