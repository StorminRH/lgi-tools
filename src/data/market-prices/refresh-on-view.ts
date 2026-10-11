import { cacheLife } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db';
import type { PriceSourceCounts } from '@/lib/alerts';
import { bestEffort } from '@/lib/best-effort';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { mapConcurrent } from '@/lib/fan-out';
import { runWriteBehind, type WriteBehindResult } from '@/lib/write-behind';
import { consumeFreshPriceResolution, markFreshPriceResolution } from './cache-resolution';
import { PER_TYPE_CONCURRENCY } from './constants';
import { persistPrices } from './ingest';
import { getPrices } from './queries';
import { fetchFuzzworkFallback, fetchPricesFromEsiPerType } from './source';
import type { MarketPrice, RawMarketPrice } from './types';

const MARKET_PRICES_FRESHNESS = freshnessGate('market_prices');

const LIVE_CACHE_LIFE = { stale: 30, revalidate: 30, expire: 60 };

export interface LivePricesMetrics {
  requested: number;
  returned: number;
  cacheHits: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
}

const SCOPE = 'market-prices/refresh-on-view';

export interface LivePricesResult {
  prices: Map<number, MarketPrice>;
  degraded: PriceSourceCounts;
  metrics: LivePricesMetrics;
}

interface LivePrice {
  raw: RawMarketPrice | null;
  /** ESI could not price the type, so it waits for the batched Fuzzwork fallback. */
  esiFailed: boolean;
  budgetExhausted: boolean;
  resolutionId: string;
  fetchedAtMs: number;
}

/**
 * One type's ESI read, cached for LIVE_CACHE_LIFE. An ESI failure is a
 * returned value, so it is cached like a success and ESI is not asked again
 * for that type until the entry lapses. The Fuzzwork fallback runs outside
 * the cache, once per refresh, over every type that failed.
 */
async function fetchLivePrice(typeId: number): Promise<LivePrice> {
  'use cache: remote';
  cacheLife(LIVE_CACHE_LIFE);
  const { prices, failed, budgetExhausted } = await fetchPricesFromEsiPerType([typeId]);
  return {
    raw: prices[0] ?? null,
    esiFailed: failed.length > 0,
    budgetExhausted,
    resolutionId: markFreshPriceResolution(),
    fetchedAtMs: Date.now(),
  };
}

type LiveEntry = LivePrice & { cacheHit: boolean };

/**
 * Prices every ESI-failed entry of `live` (indexed like `staleIds`) with one
 * Fuzzwork call. A fallback row is a fresh fetch, never a cache hit. When
 * Fuzzwork fails too, the failure is logged and those entries keep no row,
 * so the caller falls back to the seed.
 */
async function withFuzzworkFallback(staleIds: number[], live: LiveEntry[]): Promise<LiveEntry[]> {
  const failedIds = staleIds.filter((_, i) => live[i]!.esiFailed);
  if (failedIds.length === 0) return live;
  let rows: RawMarketPrice[] = [];
  await bestEffort(SCOPE, 'Fuzzwork fallback', null, async () => {
    rows = await fetchFuzzworkFallback(failedIds);
  });
  const fetchedAtMs = Date.now();
  const byType = new Map(rows.map((row) => [row.typeId, row]));
  return live.map((entry, i) => {
    const row = entry.esiFailed ? byType.get(staleIds[i]!) : undefined;
    return row ? { ...entry, raw: row, fetchedAtMs, cacheHit: false } : entry;
  });
}

export async function getLivePrices(
  typeIds: number[],
  onWriteBehind?: (result: WriteBehindResult) => void,
): Promise<LivePricesResult> {
  const ids = [...new Set(typeIds)];
  const degraded: PriceSourceCounts = {
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
  const esiReads = await mapConcurrent(staleIds, PER_TYPE_CONCURRENCY, async (id): Promise<LiveEntry> => {
    try {
      const result = await fetchLivePrice(id);
      return {
        ...result,
        cacheHit: !consumeFreshPriceResolution(result.resolutionId),
      };
    } catch {
      return {
        raw: null,
        esiFailed: true,
        budgetExhausted: false,
        resolutionId: '',
        fetchedAtMs: 0,
        cacheHit: false,
      };
    }
  });
  const live = await withFuzzworkFallback(staleIds, esiReads);

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
    after(() =>
      runWriteBehind(
        SCOPE,
        freshRaws.length,
        async () => {
          const { written } = await persistPrices(db, freshRaws, { fetchedAtByType });
          return { succeeded: freshRaws.length, written };
        },
        onWriteBehind,
      ),
    );
  }

  metrics.returned = prices.size;
  return { prices, degraded, metrics };
}
