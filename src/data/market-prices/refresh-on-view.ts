import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { consumeFreshPriceResolution, markFreshPriceResolution } from './cache-resolution';
import { PER_TYPE_CONCURRENCY } from './constants';
import { persistPrices } from './ingest';
import { getPrices } from './queries';
import { fetchPricesFromSource } from './source';
import type { MarketPrice, RawMarketPrice } from './types';

const MARKET_PRICES_FRESHNESS = freshnessGate('market_prices');

export function priceTag(typeId: number): string {
  return `market-price-${typeId}`;
}

const LIVE_CACHE_LIFE = { stale: 30, revalidate: 30, expire: 60 };

export interface LivePricesDegradation {
  fetched: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

export interface LivePricesMetrics {
  requested: number;
  returned: number;
  cacheHits: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
}

export interface PriceWriteBehindResult {
  outcome: 'succeeded' | 'failed';
  attempted: number;
  written: number;
  durationMs: number;
}

function notifyWriteBehind(
  observer: ((result: PriceWriteBehindResult) => void) | undefined,
  result: PriceWriteBehindResult,
): void {
  try {
    observer?.(result);
  } catch (err) {
    console.error('[market-prices/refresh-on-view] write-behind observer failed', err);
  }
}

export interface LivePricesResult {

  prices: Map<number, MarketPrice>;
  degraded: LivePricesDegradation;
  metrics: LivePricesMetrics;
}

async function fetchLivePrice(
  typeId: number,
): Promise<{ raw: RawMarketPrice | null; budgetExhausted: boolean; resolutionId: string }> {
  'use cache: remote';
  cacheTag(priceTag(typeId));
  cacheLife(LIVE_CACHE_LIFE);
  const { prices, budgetExhausted } = await fetchPricesFromSource([typeId]);
  return {
    raw: prices[0] ?? null,
    budgetExhausted,
    resolutionId: markFreshPriceResolution(),
  };
}

async function mapBounded<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function getLivePrices(
  typeIds: number[],
  onWriteBehind?: (result: PriceWriteBehindResult) => void,
): Promise<LivePricesResult> {
  const ids = [...new Set(typeIds)];
  const degraded: LivePricesDegradation = {
    fetched: 0,
    esiCount: 0,
    fuzzworkFallbackCount: 0,
    budgetExhausted: false,
  };
  const metrics: LivePricesMetrics = {
    requested: ids.length,
    returned: 0,
    cacheHits: 0,
    esiCount: 0,
    fuzzworkFallbackCount: 0,
  };
  if (ids.length === 0) return { prices: new Map(), degraded, metrics };

  const seed = await getPrices(ids);

  const live = await mapBounded(ids, PER_TYPE_CONCURRENCY, async (id) => {
    try {
      const result = await fetchLivePrice(id);
      return {
        ...result,
        cacheHit: !consumeFreshPriceResolution(result.resolutionId),
      };
    } catch {

      return {
        raw: null as RawMarketPrice | null,
        budgetExhausted: false,
        resolutionId: '',
        cacheHit: false,
      };
    }
  });

  const now = new Date();
  const staleAfter = new Date(
    now.getTime() + MARKET_PRICES_FRESHNESS.ttlMs,
  );
  const prices = new Map<number, MarketPrice>();
  const freshRaws: RawMarketPrice[] = [];

  ids.forEach((id, i) => {

    const { raw, budgetExhausted, cacheHit } = live[i]!;
    if (budgetExhausted) degraded.budgetExhausted = true;
    if (raw) {
      degraded.fetched++;
      if (raw.source === 'esi') degraded.esiCount++;
      else degraded.fuzzworkFallbackCount++;
      if (cacheHit) metrics.cacheHits++;
      else if (raw.source === 'esi') metrics.esiCount++;
      else metrics.fuzzworkFallbackCount++;
      freshRaws.push(raw);

      prices.set(id, { ...raw, updatedAt: now, staleAfter });
    } else {
      const seeded = seed.get(id);
      if (seeded) prices.set(id, seeded);
    }
  });

  if (freshRaws.length > 0) {
    after(async () => {
      const startedAt = Date.now();
      try {
        const summary = await persistPrices(db, freshRaws);
        notifyWriteBehind(onWriteBehind, {
          outcome: 'succeeded',
          attempted: freshRaws.length,
          written: summary.written,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        console.error('[market-prices/refresh-on-view] write-behind failed', err);
        notifyWriteBehind(onWriteBehind, {
          outcome: 'failed',
          attempted: freshRaws.length,
          written: 0,
          durationMs: Date.now() - startedAt,
        });
      }
    });
  }

  metrics.returned = prices.size;
  return { prices, degraded, metrics };
}

export async function refreshPricesOnDemand(typeIds: number[]): Promise<void> {
  for (const id of new Set(typeIds)) {
    revalidateTag(priceTag(id), 'max');
  }
}
