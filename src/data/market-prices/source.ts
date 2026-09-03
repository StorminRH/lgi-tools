import { z } from 'zod';
import {
  BULK_THRESHOLD,
  ESI_REGION_ID_FORGE,
  JITA_44_STATION_ID,
  PAGE_CONCURRENCY,
  PER_TYPE_CONCURRENCY,
  REGIONAL_DISCOUNT_MIN_PCT,
  REGIONAL_DISCOUNT_MIN_UNITS,
} from './constants';
import {
  EsiBudgetExhaustedError,
  EsiContractError,
  EsiServerError,
  esiFetch,
  esiUrl,
} from '@/platform/esi';
import { dedupe } from '@/lib/array';
import {
  computeDepth,
  computeSide,
  computeRegionalDiscount,
  filterBuyOrdersBelowSpreadFloor,
  isDiscountEligibleLocation,
  type OrderEntry,
  type RemoteStationBook,
} from './book-math';
import { fetchPricesFromFuzzwork } from './source-fallback';
import type { RawMarketPrice } from './types';

export { computeDepth, computeSide } from './book-math';

const esiOrderSchema = z.object({
  type_id: z.number(),
  is_buy_order: z.boolean(),
  price: z.number(),
  volume_remain: z.number(),
  location_id: z.number(),
  system_id: z.number(),
});
const esiOrdersSchema = z.array(esiOrderSchema);

type EsiOrder = z.infer<typeof esiOrderSchema>;

function parseEsiOrders(body: unknown): EsiOrder[] {
  const result = esiOrdersSchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data;
}

function filterRawByWantedType(body: unknown, wanted: Set<number>): unknown[] {
  if (!Array.isArray(body)) throw new EsiContractError();
  return body.filter((o) => {
    const typeId = (o as { type_id?: unknown } | null)?.type_id;
    return typeof typeId === 'number' && wanted.has(typeId);
  });
}

interface OrderBucket {
  hubBuy: OrderEntry[];
  hubSell: OrderEntry[];
  remoteSell: Map<number, RemoteStationBook>;
}

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
          await worker(items[i]!);
        } catch (err) {
          cancelled = true;
          throw err;
        }
      }
    },
  );
  await Promise.all(workers);
}

function absorbOrders(
  orders: EsiOrder[],
  wanted: Set<number>,
  buckets: Map<number, OrderBucket>,
): void {
  for (const o of orders) {
    if (!wanted.has(o.type_id)) continue;
    const atHub = o.location_id === JITA_44_STATION_ID;
    if (o.is_buy_order && !atHub) continue;
    let bucket = buckets.get(o.type_id);
    if (!bucket) {
      bucket = { hubBuy: [], hubSell: [], remoteSell: new Map() };
      buckets.set(o.type_id, bucket);
    }
    const entry: OrderEntry = {
      price: o.price,
      volume: BigInt(o.volume_remain),
    };
    if (o.is_buy_order) bucket.hubBuy.push(entry);
    else if (atHub) bucket.hubSell.push(entry);
    else absorbRemoteSell(bucket, o, entry);
  }
}

function absorbRemoteSell(
  bucket: OrderBucket,
  o: EsiOrder,
  entry: OrderEntry,
): void {
  if (!isDiscountEligibleLocation(o.location_id)) return;
  let book = bucket.remoteSell.get(o.location_id);
  if (!book) {
    book = { systemId: o.system_id, orders: [] };
    bucket.remoteSell.set(o.location_id, book);
  }
  book.orders.push(entry);
}

function bucketToRawPrice(
  typeId: number,
  bucket: OrderBucket,
): RawMarketPrice {
  const sell = computeSide(bucket.hubSell, 'asc');
  const hubBuy = filterBuyOrdersBelowSpreadFloor(bucket.hubBuy, sell.best);
  const buy = computeSide(hubBuy, 'desc');
  return {
    typeId,
    bestBuy: buy.best,
    pct5Buy: buy.pct5,
    bestSell: sell.best,
    pct5Sell: sell.pct5,
    buyVolume: buy.volume,
    sellVolume: sell.volume,
    buyDepth: computeDepth(hubBuy, 'desc', buy.best),
    sellDepth: computeDepth(bucket.hubSell, 'asc', sell.best),
    regionalDiscount: computeRegionalDiscount(bucket.remoteSell, sell.best, {
      minPct: REGIONAL_DISCOUNT_MIN_PCT,
      minUnits: REGIONAL_DISCOUNT_MIN_UNITS,
    }),
    source: 'esi',
  };
}

function bucketsToRawPrices(
  typeIds: number[],
  buckets: Map<number, OrderBucket>,
): RawMarketPrice[] {
  const emptyBucket: OrderBucket = {
    hubBuy: [],
    hubSell: [],
    remoteSell: new Map(),
  };
  return typeIds.map((typeId) =>
    bucketToRawPrice(typeId, buckets.get(typeId) ?? emptyBucket),
  );
}

function regionDumpPageUrl(page: number): string {
  return esiUrl(`/markets/${ESI_REGION_ID_FORGE}/orders/?order_type=all&page=${page}`);
}

function perTypeUrl(typeId: number): string {
  return esiUrl(`/markets/${ESI_REGION_ID_FORGE}/orders/?type_id=${typeId}&order_type=all`);
}

async function fetchViaEsiRegionDump(
  typeIds: number[],
): Promise<RawMarketPrice[]> {
  const wanted = new Set(typeIds);
  const buckets = new Map<number, OrderBucket>();

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
      fallbackNeeded.push(typeId);
    }
  });

  if (fallbackNeeded.length > 0) {
    const fb = await fallbackToFuzzwork(fallbackNeeded);
    results.push(...fb);
  }

  return { prices: results, budgetExhausted };
}

async function fallbackToFuzzwork(
  typeIds: number[],
): Promise<RawMarketPrice[]> {
  const raw = await fetchPricesFromFuzzwork(typeIds);
  return raw.map((r) => ({ ...r, source: 'fuzzwork-fallback' as const }));
}

/**
 * Returns the priced rows plus a `budgetExhausted` flag — true when ESI's
 * error budget was hit (either the pre-dispatch gate or a 420), which forced
 * the Fuzzwork fallback. The flag is the one degradation fact callers can't
 * reconstruct from the row `source` values alone (a fallback row reads the
 * same whether it came from an ESI 5xx or budget exhaustion); the route
 * handlers thread it into the O-1 telemetry. The data slice itself never
 * imports telemetry — the boundary stays sealed.
 */
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
