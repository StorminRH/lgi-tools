import { after } from 'next/server';
import { commit, isExpired, storedExpiries, type EsiResponseMeta } from '@/data/esi-store';
import { db } from '@/db';
import type { PriceSourceCounts } from '@/lib/alerts';
import { dedupe } from '@/lib/array';
import { runWriteBehind, type WriteBehindResult } from '@/lib/write-behind';
import { persistPrices } from './ingest';
import { MARKET_PRICES_TAG, priceKey } from './keys';
import { getPrices } from './queries';
import { fetchPricesPerType, type SourcePrices } from './source';
import type { MarketPrice, RawMarketPrice } from './types';

export interface LivePricesMetrics {
  requested: number;
  returned: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
}

const SCOPE = 'market-prices/refresh-on-view';

export interface LivePricesResult {
  prices: Map<number, MarketPrice>;
  degraded: PriceSourceCounts;
  metrics: LivePricesMetrics;
}

const NOTHING_FETCHED: SourcePrices = { prices: [], budgetExhausted: false, metaByType: new Map() };

/** A stored price with the store's expiry as its stale-after; a key with none is already due. */
function served(row: MarketPrice, expiresAt: number | null): MarketPrice {
  return { ...row, staleAfter: new Date(expiresAt ?? row.updatedAt.getTime()) };
}

/** The write that lands after the response: the rows first, then their ESI meta, so a failed write records no expiry. */
function writeBehind(
  live: SourcePrices,
  stamps: { fetchedAtByType: Map<number, Date>; staleAfterByType: Map<number, Date> },
  onWriteBehind: ((result: WriteBehindResult) => void) | undefined,
): void {
  after(() =>
    runWriteBehind(
      SCOPE,
      live.prices.length,
      async () => {
        const { written } = await persistPrices(db, live.prices, stamps);
        await commit([...live.metaByType.values()], { tag: MARKET_PRICES_TAG });
        return { succeeded: live.prices.length, written };
      },
      onWriteBehind,
    ),
  );
}

/**
 * The prices a view asks for: every type whose stored copy is unexpired is
 * served from Neon without a call; the rest are asked of ESI through the
 * store, one order-book call per type however many there are (or Fuzzwork
 * when ESI cannot answer), and written behind the response, with CCP's
 * expiry committed in the same after(). A view never reads the region
 * dump; that is the cron sweep's alone.
 */
export async function getLivePrices(
  typeIds: number[],
  onWriteBehind?: (result: WriteBehindResult) => void,
): Promise<LivePricesResult> {
  const ids = dedupe(typeIds);
  const degraded: PriceSourceCounts = {
    fetched: 0,
    esiCount: 0,
    fuzzworkFallbackCount: 0,
    budgetExhausted: false,
  };
  const metrics: LivePricesMetrics = { requested: ids.length, returned: 0, esiCount: 0, fuzzworkFallbackCount: 0 };
  if (ids.length === 0) return { prices: new Map(), degraded, metrics };

  const [seed, expiries] = await Promise.all([getPrices(ids), storedExpiries(ids.map(priceKey))]);
  const now = Date.now();
  const prices = new Map<number, MarketPrice>();
  const dueIds: number[] = [];
  ids.forEach((id, i) => {
    const row = seed.get(id);
    const expiresAt = expiries[i] ?? null;
    if (row !== undefined && !isExpired(expiresAt, now)) prices.set(id, served(row, expiresAt));
    else dueIds.push(id);
  });

  const live = dueIds.length > 0 ? await fetchPricesPerType(dueIds) : NOTHING_FETCHED;
  degraded.budgetExhausted = live.budgetExhausted;
  const fetchedAtByType = new Map<number, Date>();
  const staleAfterByType = new Map<number, Date>();
  for (const raw of live.prices) {
    const meta: EsiResponseMeta | undefined = live.metaByType.get(raw.typeId);
    const updatedAt = new Date(meta?.checkedAt ?? now);
    const staleAfter = new Date(meta?.expiresAt ?? updatedAt.getTime());
    countFetched(degraded, metrics, raw);
    fetchedAtByType.set(raw.typeId, updatedAt);
    staleAfterByType.set(raw.typeId, staleAfter);
    prices.set(raw.typeId, { ...raw, updatedAt, staleAfter });
  }
  for (const id of dueIds) {
    const seeded = seed.get(id);
    if (!prices.has(id) && seeded !== undefined) prices.set(id, served(seeded, expiries[ids.indexOf(id)] ?? null));
  }

  if (live.prices.length > 0) writeBehind(live, { fetchedAtByType, staleAfterByType }, onWriteBehind);

  metrics.returned = prices.size;
  return { prices, degraded, metrics };
}

function countFetched(degraded: PriceSourceCounts, metrics: LivePricesMetrics, raw: RawMarketPrice): void {
  degraded.fetched++;
  if (raw.source === 'esi') {
    degraded.esiCount++;
    metrics.esiCount++;
  } else {
    degraded.fuzzworkFallbackCount++;
    metrics.fuzzworkFallbackCount++;
  }
}
