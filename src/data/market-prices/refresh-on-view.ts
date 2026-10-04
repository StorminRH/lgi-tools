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
): Promise<{ raw: RawMarketPrice | null; budgetExhausted: boolean; resolutionId: string; fetchedAtMs: number }> {
  'use cache: remote';
  cacheTag(priceTag(typeId));
  cacheLife(LIVE_CACHE_LIFE);
  const { prices, budgetExhausted } = await fetchPricesFromSource([typeId]);
  return {
    raw: prices[0] ?? null,
    budgetExhausted,
    resolutionId: markFreshPriceResolution(),
    fetchedAtMs: Date.now(),
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
  const now = Date.now();
  const prices = new Map<number, MarketPrice>();
  for (const [id, row] of seed) {
    // Clamp pre-hotfix rows carrying the old 24-hour expiry without a migration.
    const expiresAt = Math.min(row.staleAfter.getTime(), row.updatedAt.getTime() + MARKET_PRICES_FRESHNESS.ttlMs);
    if (expiresAt > now) prices.set(id, { ...row, staleAfter: new Date(expiresAt) });
  }
  const staleIds = ids.filter((id) => !prices.has(id));
  const live = await mapBounded(staleIds, PER_TYPE_CONCURRENCY, async (id) => {
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
        fetchedAtMs: 0,
        cacheHit: false,
      };
    }
  });

  const freshRaws: RawMarketPrice[] = [];
  const fetchedAtByType = new Map<number, Date>();

  staleIds.forEach((id, i) => {
    const { raw, budgetExhausted, cacheHit, fetchedAtMs } = live[i]!;
    if (budgetExhausted) degraded.budgetExhausted = true;
    if (raw) {
      degraded.fetched++;
      if (raw.source === 'esi') degraded.esiCount++;
      else degraded.fuzzworkFallbackCount++;
      if (cacheHit) metrics.cacheHits++;
      else if (raw.source === 'esi') metrics.esiCount++;
      else metrics.fuzzworkFallbackCount++;
      const updatedAt = new Date(fetchedAtMs);
      const staleAfter = new Date(fetchedAtMs + MARKET_PRICES_FRESHNESS.ttlMs);
      freshRaws.push(raw);
      fetchedAtByType.set(id, updatedAt);
      prices.set(id, { ...raw, updatedAt, staleAfter });
    } else {
      const seeded = seed.get(id);
      if (seeded) prices.set(id, {
        ...seeded,
        staleAfter: new Date(Math.min(seeded.staleAfter.getTime(), seeded.updatedAt.getTime() + MARKET_PRICES_FRESHNESS.ttlMs)),
      });
    }
  });

  if (freshRaws.length > 0) {
    after(async () => {
      const startedAt = Date.now();
      try {
        const summary = await persistPrices(db, freshRaws, { fetchedAtByType });
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
