import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { db } from '@/db';
import { PER_TYPE_CONCURRENCY, STALE_AFTER_TTL_MS } from './constants';
import { persistPrices } from './ingest';
import { getPrices } from './queries';
import { fetchPricesFromSource } from './source';
import type { MarketPrice, RawMarketPrice } from './types';

// Refresh-on-view engine (3.2.4a). The reusable server half of live pricing:
// read the durable DB seed, fetch live (coalesced so concurrent viewers of the
// same item share one source call), return the freshest available value, and
// persist the fresh rows back as the new seed behind the response. A primitive
// both the Industry Planner and the wormhole sites page consume (via the refresh
// route, through the shared useRefreshOnView hook) — not planner-specific.
//
// It threads degradation facts out in its return value and never imports
// telemetry: `data ⊥ telemetry` stays sealed, and the route handler emits
// (exactly as the bulk refresh path does).

// Per-item short-term cache tag. Exported so an explicit refresh can bust a
// single item's coalescing entry.
export function priceTag(typeId: number): string {
  return `market-price-${typeId}`;
}

// ~30s coalescing window. `revalidate: 30` → within 30s a view is a cache hit
// and makes no source call; after 30s the next view serves the last value while
// it refetches in the background (stale-while-revalidate). `expire: 60` must be
// greater than `revalidate`. These short lifetimes make the entry a request-time
// dynamic hole (excluded from the prerender), which is exactly the live path.
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
  // Freshest value available per type: the live fetch where it succeeded, the
  // DB seed otherwise. Types with neither are simply absent (caller treats a
  // missing entry as "no price", same as getPrices).
  prices: Map<number, MarketPrice>;
  degraded: LivePricesDegradation;
  metrics: LivePricesMetrics;
}

// One coalesced live fetch for a single type. `'use cache: remote'` so the
// window is shared across all serverless instances (plain in-memory `use cache`
// does not persist across requests on Vercel, so it would not coalesce). The
// per-item `cacheTag` lets an explicit refresh bust exactly one item.
//
// A length-1 input takes fetchPricesFromSource's per-type path, preserving the
// ESI→Fuzzwork fallback and the module-level error-budget gate. Returns the raw
// row (or null when the source produced nothing) plus the one degradation fact
// the row's `source` can't convey on its own (budget exhaustion).
async function fetchLivePrice(
  typeId: number,
): Promise<{ raw: RawMarketPrice | null; budgetExhausted: boolean; resolvedAt: number }> {
  'use cache: remote';
  cacheTag(priceTag(typeId));
  cacheLife(LIVE_CACHE_LIFE);
  const { prices, budgetExhausted } = await fetchPricesFromSource([typeId]);
  return { raw: prices[0] ?? null, budgetExhausted, resolvedAt: Date.now() };
}

// Bounded-concurrency map. Cache hits resolve instantly; this caps how many
// genuine source fetches (cache misses) run at once so a large request can't
// fan out a burst of ESI calls — keeping the error-budget behaviour effectively
// unchanged from the per-type cron path.
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
      results[i] = await worker(items[i]!); // i < items.length guaranteed by the guard above
    }
  });
  await Promise.all(runners);
  return results;
}

// On-view read. Returns the freshest prices available and persists the freshly
// fetched rows as the new seed behind the response (never blocking it).
export async function getLivePrices(
  typeIds: number[],
  onWriteBehind?: (result: PriceWriteBehindResult) => void,
): Promise<LivePricesResult> {
  const requestStartedAt = Date.now();
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

  // Durable last-known seed — the fallback for cold items, for an item whose
  // live fetch fails, and for callers the live fetch never reaches (crawlers,
  // link-preview embeds).
  const seed = await getPrices(ids);

  const live = await mapBounded(ids, PER_TYPE_CONCURRENCY, async (id) => {
    try {
      return await fetchLivePrice(id);
    } catch {
      // fetchPricesFromSource can still throw if the Fuzzwork fallback itself
      // fails — degrade to the seed for this item rather than failing the read.
      return {
        raw: null as RawMarketPrice | null,
        budgetExhausted: false,
        resolvedAt: Date.now(),
      };
    }
  });

  const now = new Date();
  const staleAfter = new Date(now.getTime() + STALE_AFTER_TTL_MS);
  const prices = new Map<number, MarketPrice>();
  const freshRaws: RawMarketPrice[] = [];

  ids.forEach((id, i) => {
    // live is parallel to ids (mapBounded returns Array(ids.length)); i is the forEach index.
    const { raw, budgetExhausted, resolvedAt } = live[i]!;
    if (budgetExhausted) degraded.budgetExhausted = true;
    if (raw) {
      degraded.fetched++;
      if (raw.source === 'esi') degraded.esiCount++;
      else degraded.fuzzworkFallbackCount++;
      if (resolvedAt < requestStartedAt) metrics.cacheHits++;
      else if (raw.source === 'esi') metrics.esiCount++;
      else metrics.fuzzworkFallbackCount++;
      freshRaws.push(raw);
      // Stamp the same updatedAt/staleAfter the write-behind will persist, so
      // the returned shape matches the seed shape and reads as fresh.
      prices.set(id, { ...raw, updatedAt: now, staleAfter });
    } else {
      const seeded = seed.get(id);
      if (seeded) prices.set(id, seeded);
    }
  });

  // Write-behind: persist the freshly fetched rows as the new seed after the
  // response is sent. `after` extends the invocation (waitUntil) so the upsert
  // lands before the function freezes; a failure here must never surface.
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

// Explicit refresh: mark each item's coalescing entry stale so the next view
// refetches (stale-while-revalidate via the 'max' profile). Built as the engine
// primitive now; a runtime caller (a "refresh now" affordance, the rewired CLI)
// lands in a later sub-version.
export async function refreshPricesOnDemand(typeIds: number[]): Promise<void> {
  for (const id of new Set(typeIds)) {
    revalidateTag(priceTag(id), 'max');
  }
}
