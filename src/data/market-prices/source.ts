import { z } from 'zod';
import {
  BULK_THRESHOLD,
  JITA_44_STATION_ID,
  PAGE_CONCURRENCY,
  PER_TYPE_CONCURRENCY,
  REGIONAL_DISCOUNT_MIN_PCT,
  REGIONAL_DISCOUNT_MIN_UNITS,
} from './constants';
import { fetchStored, fetchStoredMany, type EsiResponseMeta, type StoredManyAnswer } from '@/data/esi-store';
import {
  EsiBudgetExhaustedError,
  EsiContractError,
  EsiServerError,
} from '@/platform/esi';
import { esiPageCount } from '@/platform/esi/headers';
import { dedupe, getOrInsertComputed } from '@/lib/array';
import { bestEffort } from '@/lib/best-effort';
import { mapConcurrent } from '@/lib/fan-out';
import {
  computeDepth,
  computeSide,
  computeRegionalDiscount,
  filterBuyOrdersBelowSpreadFloor,
  isDiscountEligibleLocation,
  type OrderEntry,
  type RemoteStationBook,
} from './book-math';
import { priceKey, regionDumpKey } from './keys';
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

function absorbOrders(
  orders: EsiOrder[],
  wanted: Set<number>,
  buckets: Map<number, OrderBucket>,
): void {
  for (const o of orders) {
    if (!wanted.has(o.type_id)) continue;
    const atHub = o.location_id === JITA_44_STATION_ID;
    if (o.is_buy_order && !atHub) continue;
    const bucket = getOrInsertComputed(buckets, o.type_id, () => ({ hubBuy: [], hubSell: [], remoteSell: new Map() }));
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
  const book = getOrInsertComputed(bucket.remoteSell, o.location_id, () => ({ systemId: o.system_id, orders: [] }));
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

/** The priced rows, with each ESI-priced type's answer meta to commit once the rows are written. */
export interface SourcePrices {
  prices: RawMarketPrice[];
  budgetExhausted: boolean;
  metaByType: ReadonlyMap<number, EsiResponseMeta>;
}

/** A dump page the store answered without calling (the downtime halt): the dump cannot be read whole this time. */
class DumpUnavailable extends Error {
  constructor() {
    super('region order dump unavailable');
    this.name = 'DumpUnavailable';
  }
}

/** One dump page as its own call parsed it: the wanted types' orders, and the page count page 1 states. */
interface DumpPage {
  readonly totalPages: number;
  readonly orders: EsiOrder[];
}

/**
 * One page of the nightly region dump. The page keys are never committed,
 * so every page is due and called whole, without If-None-Match; what the
 * dump learns about expiry is fanned out to the type keys it priced. The
 * page is cut down to the wanted types inside its own call.
 */
async function fetchDumpPage(page: number, wanted: Set<number>): Promise<{ value: DumpPage; meta: EsiResponseMeta }> {
  const result = await fetchStored(regionDumpKey(page), {
    conditional: false,
    parse: (body, headers): DumpPage => ({
      totalPages: esiPageCount(headers),
      orders: parseEsiOrders(filterRawByWantedType(body, wanted)),
    }),
  });
  if (result.kind === 'unchanged') throw new DumpUnavailable();
  if (result.kind === 'error') throw new EsiServerError(result.status);
  return result;
}

async function fetchViaEsiRegionDump(
  typeIds: number[],
): Promise<{ prices: RawMarketPrice[]; meta: EsiResponseMeta }> {
  const wanted = new Set(typeIds);
  const buckets = new Map<number, OrderBucket>();

  const first = await fetchDumpPage(1, wanted);
  const totalPages = first.value.totalPages;
  absorbOrders(first.value.orders, wanted, buckets);

  if (totalPages > 1) {
    const pages: number[] = [];
    for (let p = 2; p <= totalPages; p++) pages.push(p);
    await mapConcurrent(pages, PAGE_CONCURRENCY, async (page) => {
      const { value } = await fetchDumpPage(page, wanted);
      absorbOrders(value.orders, wanted, buckets);
    });
  }

  return { prices: bucketsToRawPrices(typeIds, buckets), meta: first.meta };
}

/** The first page's expiry under each priced type's own key; the page's ETag and body stay with the page. */
function fanOutDumpMeta(prices: readonly RawMarketPrice[], meta: EsiResponseMeta): Map<number, EsiResponseMeta> {
  return new Map(prices.map((price) => [price.typeId, { ...meta, key: priceKey(price.typeId), etags: [] }]));
}

type TypeRead =
  | { kind: 'priced'; price: RawMarketPrice; meta: EsiResponseMeta }
  | { kind: 'unchanged' }
  | { kind: 'fallback'; budgetExhausted: boolean };

/**
 * One type's answer from the batched store read, its orders already parsed
 * inside its call. Unexpired, a 304 and the downtime halt all mean the
 * stored price stands; an error status, a malformed body (a failed key) or
 * a refused call sends the type to Fuzzwork, as before.
 */
function readOneType(typeId: number, answer: StoredManyAnswer<EsiOrder[]>): TypeRead {
  if (answer.kind === 'unchanged') return { kind: 'unchanged' };
  if (answer.kind === 'failed') return { kind: 'fallback', budgetExhausted: answer.error instanceof EsiBudgetExhaustedError };
  if (answer.kind === 'error') return { kind: 'fallback', budgetExhausted: false };
  const buckets = new Map<number, OrderBucket>();
  absorbOrders(answer.value, new Set([typeId]), buckets);
  return { kind: 'priced', price: bucketsToRawPrices([typeId], buckets)[0]!, meta: answer.meta };
}

/**
 * What a Fuzzwork row records for its type: no ETag and no expiry. The row
 * replaced whatever ESI price an ETag vouched for, so the next view must ask
 * ESI unconditionally, never take a 304 as leave to serve this row.
 */
function fallbackMeta(typeId: number, checkedAt: number): EsiResponseMeta {
  return { key: priceKey(typeId), expiresAt: null, etags: [], lastModified: null, checkedAt };
}

interface FallbackRows {
  prices: RawMarketPrice[];
  metas: [number, EsiResponseMeta][];
}

type FallbackPricer = (typeIds: number[]) => Promise<FallbackRows>;

/** The Fuzzwork rows for types ESI could not price, each with the meta that clears its old ETag. */
async function fallbackPrices(typeIds: number[]): Promise<FallbackRows> {
  const prices = await fallbackToFuzzwork(typeIds);
  const checkedAt = Date.now();
  return { prices, metas: prices.map((price) => [price.typeId, fallbackMeta(price.typeId, checkedAt)]) };
}

/**
 * The page view's fallback: a Fuzzwork outage is logged once and those
 * types stay unpriced, with no meta, so the view serves their seed and the
 * ESI answers already in hand still return and write behind.
 */
async function bestEffortFallbackPrices(typeIds: number[]): Promise<FallbackRows> {
  let rows: FallbackRows = { prices: [], metas: [] };
  await bestEffort('market-prices/source', 'Fuzzwork fallback', null, async () => {
    rows = await fallbackPrices(typeIds);
  });
  return rows;
}

/**
 * Every type through its own order-book call: one store read for all of
 * them, PER_TYPE_CONCURRENCY calls in flight, one write for the 304s. The
 * types ESI could not price go to `fallback` in one batch.
 */
async function pricePerType(typeIds: number[], fallback: FallbackPricer): Promise<SourcePrices> {
  const unique = dedupe(typeIds);
  const answers = await fetchStoredMany(unique.map(priceKey), { concurrency: PER_TYPE_CONCURRENCY, parse: parseEsiOrders });
  const results: RawMarketPrice[] = [];
  const metaByType = new Map<number, EsiResponseMeta>();
  const fallbackNeeded: number[] = [];
  let budgetExhausted = false;

  for (const [i, typeId] of unique.entries()) {
    const read = readOneType(typeId, answers[i]!);
    if (read.kind === 'priced') {
      results.push(read.price);
      metaByType.set(typeId, read.meta);
    } else if (read.kind === 'fallback') {
      budgetExhausted ||= read.budgetExhausted;
      fallbackNeeded.push(typeId);
    }
  }

  if (fallbackNeeded.length > 0) {
    const fb = await fallback(fallbackNeeded);
    results.push(...fb.prices);
    for (const [typeId, meta] of fb.metas) metaByType.set(typeId, meta);
  }

  return { prices: results, budgetExhausted, metaByType };
}

/**
 * The only path a page view takes, whatever the count: the region dump
 * belongs to the cron sweep alone. A failed Fuzzwork fallback never fails
 * the view; the cron's per-type read still lets it throw.
 */
export function fetchPricesPerType(typeIds: number[]): Promise<SourcePrices> {
  return pricePerType(typeIds, bestEffortFallbackPrices);
}

async function fallbackToFuzzwork(
  typeIds: number[],
): Promise<RawMarketPrice[]> {
  const raw = await fetchPricesFromFuzzwork(typeIds);
  return raw.map((r) => ({ ...r, source: 'fuzzwork-fallback' as const }));
}

async function fetchViaBulk(unique: number[]): Promise<SourcePrices> {
  try {
    const { prices, meta } = await fetchViaEsiRegionDump(unique);
    return { prices, budgetExhausted: false, metaByType: fanOutDumpMeta(prices, meta) };
  } catch (err) {
    if (err instanceof DumpUnavailable) return { prices: [], budgetExhausted: false, metaByType: new Map() };
    if (
      err instanceof EsiBudgetExhaustedError ||
      err instanceof EsiServerError ||
      err instanceof EsiContractError
    ) {
      const fb = await fallbackPrices(unique);
      return { prices: fb.prices, budgetExhausted: err instanceof EsiBudgetExhaustedError, metaByType: new Map(fb.metas) };
    }
    throw err;
  }
}

/**
 * The cron sweep's (and the operator script's) read: per type below
 * BULK_THRESHOLD, the whole region dump from it. Returns the priced rows
 * plus a `budgetExhausted` flag — true when ESI's error budget was hit
 * (either the pre-dispatch gate or a 420), which forced the Fuzzwork
 * fallback. The flag is the one degradation fact callers can't reconstruct
 * from the row `source` values alone (a fallback row reads the same whether
 * it came from an ESI 5xx or budget exhaustion); the route handlers thread
 * it into the O-1 telemetry. The data slice itself never imports telemetry
 * — the boundary stays sealed. A type whose stored copy is still current
 * comes back in neither list; a Fuzzwork row's meta has no ETag and no
 * expiry, so it clears the type's old ETag and leaves it due.
 */
export async function fetchPricesFromSource(typeIds: number[]): Promise<SourcePrices> {
  if (typeIds.length === 0) return { prices: [], budgetExhausted: false, metaByType: new Map() };
  const unique = dedupe(typeIds);
  if (unique.length >= BULK_THRESHOLD) return fetchViaBulk(unique);
  return pricePerType(unique, fallbackPrices);
}
