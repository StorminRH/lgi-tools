import { z } from 'zod';
import {
  BULK_THRESHOLD,
  JITA_44_STATION_ID,
  PAGE_CONCURRENCY,
  PER_TYPE_CONCURRENCY,
  REGIONAL_DISCOUNT_MIN_PCT,
  REGIONAL_DISCOUNT_MIN_UNITS,
} from './constants';
import {
  fetchStored,
  fetchStoredMany,
  type EsiResponseMeta,
  type StoredManyAnswer,
  type StoredManyInit,
} from '@/data/esi-store';
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
import { priceKey, pricePageKey, regionDumpKey } from './keys';
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

/** One order-book page as its own call parsed it: the orders it kept, and the page count it states. */
interface OrderPage {
  readonly totalPages: number;
  readonly orders: EsiOrder[];
}

function parseOrderPage(body: unknown, headers: Headers): OrderPage {
  return { totalPages: esiPageCount(headers), orders: parseEsiOrders(body) };
}

/**
 * One page of the nightly region dump. The page keys are never committed,
 * so every page is due and called whole, without If-None-Match; what the
 * dump learns about expiry is fanned out to the type keys it priced. The
 * page is cut down to the wanted types inside its own call.
 */
async function fetchDumpPage(page: number, wanted: Set<number>): Promise<{ value: OrderPage; meta: EsiResponseMeta }> {
  const result = await fetchStored(regionDumpKey(page), {
    conditional: false,
    parse: (body, headers) => parseOrderPage(filterRawByWantedType(body, wanted), headers),
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

type Unpriced = Exclude<TypeRead, { kind: 'priced' }>;

/** One page of a type's book, read whole, with the meta its answer carried. */
interface BookPage {
  readonly kind: 'page';
  readonly value: OrderPage;
  readonly meta: EsiResponseMeta;
}

/** One type's book as its pages come in: `pages[n - 1]` is page n. The first page read without a body settles the type. */
interface Book {
  readonly typeId: number;
  readonly pages: BookPage[];
  settled?: Unpriced;
}

/** One page of one type's book: the unit a store read asks for. */
interface PageRef {
  readonly typeId: number;
  readonly page: number;
}

/** Page 1 asks under the type's own key, conditionally: the one page whose ETag is ever held. */
const FIRST_PAGES: StoredManyInit<OrderPage> = { concurrency: PER_TYPE_CONCURRENCY, parse: parseOrderPage };

/** Later pages and refetches are unconditional: a 304 against page 1's stored ETag would come back with no body. */
const WHOLE_PAGES: StoredManyInit<OrderPage> = { ...FIRST_PAGES, conditional: false };

/**
 * What one page's answer means for its type, its orders already parsed
 * inside its call. Unexpired, a 304 and the downtime halt all mean the
 * stored price stands, and so does a 404 past page 1: the book shrank
 * between its pages, so the type is read again next time. Any other error
 * status, a malformed body (a failed key) or a refused call sends the type
 * to Fuzzwork, as before.
 */
function readPage(answer: StoredManyAnswer<OrderPage>, page: number): BookPage | Unpriced {
  if (answer.kind === 'fresh') return { kind: 'page', value: answer.value, meta: answer.meta };
  if (answer.kind === 'unchanged') return { kind: 'unchanged' };
  if (answer.kind === 'failed') return { kind: 'fallback', budgetExhausted: answer.error instanceof EsiBudgetExhaustedError };
  return page > 1 && answer.status === 404 ? { kind: 'unchanged' } : { kind: 'fallback', budgetExhausted: false };
}

/** Reads `refs` in one store batch and files each answer under its type. */
async function fillBooks(books: ReadonlyMap<number, Book>, refs: readonly PageRef[], init: StoredManyInit<OrderPage>): Promise<void> {
  if (refs.length === 0) return;
  const answers = await fetchStoredMany(refs.map((ref) => pricePageKey(ref.typeId, ref.page)), init);
  refs.forEach((ref, i) => {
    const book = books.get(ref.typeId)!;
    const read = readPage(answers[i]!, ref.page);
    if (read.kind === 'page') book.pages[ref.page - 1] = read;
    else book.settled ??= read;
  });
}

/** Pages 2 to N of every unsettled book whose page 1 states N. */
function laterPages(books: Iterable<Book>): PageRef[] {
  return [...books].flatMap((book) => {
    const total = book.settled === undefined ? book.pages[0]!.value.totalPages : 1;
    return Array.from({ length: total - 1 }, (_unused, i) => ({ typeId: book.typeId, page: i + 2 }));
  });
}

/** The newest Last-Modified any page of a book carries; null when none carries one. */
function newestLastModified(pages: readonly BookPage[]): number | null {
  const stamps = pages.flatMap(({ meta }) => (meta.lastModified === null ? [] : [meta.lastModified]));
  return stamps.length === 0 ? null : Math.max(...stamps);
}

/** A page whose Last-Modified is older than its book's newest was served from the cache cycle before. */
function isOlderPage(page: BookPage, newest: number | null): boolean {
  return page.meta.lastModified !== null && page.meta.lastModified !== newest;
}

/**
 * Every page of an unsettled book served from an older cache cycle than the
 * book's newest page. CCP's check is that every page of one read carries the
 * same Last-Modified; each older page is read once more.
 */
function olderPages(books: Iterable<Book>): PageRef[] {
  return [...books].flatMap((book) => {
    if (book.settled !== undefined) return [];
    const newest = newestLastModified(book.pages);
    return book.pages.flatMap((page, i) => (isOlderPage(page, newest) ? [{ typeId: book.typeId, page: i + 1 }] : []));
  });
}

/** Every page from one cache cycle: one Last-Modified, and each stating the page count the book was read to. */
function isOneCycle(pages: readonly BookPage[]): boolean {
  const newest = newestLastModified(pages);
  return pages.every((page) => page.value.totalPages === pages.length && !isOlderPage(page, newest));
}

/** The earliest expiry over a book's pages: null when any page has none, since the book is then due. */
function earliestPageExpiry(pages: readonly BookPage[]): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const { meta } of pages) {
    if (meta.expiresAt === null) return null;
    earliest = Math.min(earliest, meta.expiresAt);
  }
  return earliest;
}

/**
 * The meta a type's price commits, under the type's own key. A one-page book
 * keeps its answer's. A longer one expires with its earliest page and holds
 * no ETag: page 1's alone would let a 304 stand for pages nobody read, so
 * the next read of a longer book is unconditional.
 */
function bookMeta(pages: readonly BookPage[]): EsiResponseMeta {
  const first = pages[0]!.meta;
  if (pages.length === 1) return first;
  return { ...first, etags: [], expiresAt: earliestPageExpiry(pages) };
}

/**
 * A type's price from its whole book, every page's orders merged before
 * the reduction. A book still read across two cache cycles after the one
 * refetch goes unpriced: its stored price stands, and the type stays due.
 */
function finishBook(book: Book): TypeRead {
  if (book.settled !== undefined) return book.settled;
  if (!isOneCycle(book.pages)) return { kind: 'unchanged' };
  const wanted = new Set([book.typeId]);
  const buckets = new Map<number, OrderBucket>();
  for (const page of book.pages) absorbOrders(page.value.orders, wanted, buckets);
  return { kind: 'priced', price: bucketsToRawPrices([book.typeId], buckets)[0]!, meta: bookMeta(book.pages) };
}

/**
 * Every type's whole Forge book: page 1 of each in one batch, every later
 * page of the longer books in a second, and in a third each page served from
 * an older cache cycle than its book's newest, once more. No page takes a
 * lock, as no store read does.
 */
async function readBooks(typeIds: readonly number[]): Promise<TypeRead[]> {
  const books = new Map(typeIds.map((typeId): [number, Book] => [typeId, { typeId, pages: [] }]));
  await fillBooks(books, typeIds.map((typeId) => ({ typeId, page: 1 })), FIRST_PAGES);
  await fillBooks(books, laterPages(books.values()), WHOLE_PAGES);
  await fillBooks(books, olderPages(books.values()), WHOLE_PAGES);
  return typeIds.map((typeId) => finishBook(books.get(typeId)!));
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
 * Every type through its own order book, every page of it: one store read
 * a batch, PER_TYPE_CONCURRENCY calls in flight, one write for the 304s.
 * The types ESI could not price go to `fallback` in one batch.
 */
async function pricePerType(typeIds: number[], fallback: FallbackPricer): Promise<SourcePrices> {
  const unique = dedupe(typeIds);
  const reads = await readBooks(unique);
  const results: RawMarketPrice[] = [];
  const metaByType = new Map<number, EsiResponseMeta>();
  const fallbackNeeded: number[] = [];
  let budgetExhausted = false;

  for (const [i, typeId] of unique.entries()) {
    const read = reads[i]!;
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
