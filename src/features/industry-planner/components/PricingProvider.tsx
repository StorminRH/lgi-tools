'use client';

import {
  createContext,
  Suspense,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from '@/data/market-prices/constants';
import type { PriceSource } from '@/data/market-prices/types';
import {
  assemblePricing,
  buildConfidenceInputs,
  collectIntermediateTypeIds,
  type PriceLite,
} from '../build-pricing';
import {
  aggregateConfidence,
  priceConfidence,
  type AggregateConfidence,
  type RowConfidence,
} from '../industry-styles';
import type { BlueprintPricing, BlueprintStructure } from '../types';

// The planner's single live-pricing store. It owns what `CostPanel` used to:
// the price snapshot seeded from the server, the client clock, and the
// on-demand refresh that tops up stale/missing rows through
// /api/market-prices/refresh. The difference from 3.1.1 is that it's a
// provider, not a panel — the hero margin, every cascade row's confidence
// badge, and the cost ledger all read the same store, so a single streamed
// price read fans out to all of them while the structure stays in the static
// shell. Prices arrive via an un-awaited promise the server hands down (see
// PricingSeeder), so the cascade structure never waits on the price read.

// The `prices` array shape returned by POST /api/market-prices/refresh.
// Volumes serialize as strings (DB bigint); source is the provenance text.
interface RefreshedPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: string | null;
  sellVolume: string | null;
  source: PriceSource;
  staleAfter: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Live price map seeded from the server snapshot — the priced raw rows, the
// product, and the buildable intermediates (so a refresh recomputes the same
// shape the server produced). Each row carries its row-level stale_after, so
// the client decides staleness and recomputes without re-reading the DB.
function initialMap(pricing: BlueprintPricing): Map<number, PriceLite> {
  const map = new Map<number, PriceLite>();
  for (const r of pricing.rows) {
    map.set(r.typeId, {
      bestBuy: r.unitBuy,
      bestSell: r.bestSell,
      pct5Buy: r.pct5Buy,
      pct5Sell: r.pct5Sell,
      buyVolume: r.buyVolume,
      sellVolume: r.sellVolume,
      source: r.source,
      staleAfterMs: r.staleAfterMs,
    });
  }
  for (const ip of pricing.intermediatePrices) {
    map.set(ip.typeId, {
      bestBuy: ip.bestBuy,
      bestSell: ip.bestSell,
      pct5Buy: ip.pct5Buy,
      pct5Sell: ip.pct5Sell,
      buyVolume: ip.buyVolume,
      sellVolume: ip.sellVolume,
      source: ip.source,
      staleAfterMs: ip.staleAfterMs,
    });
  }
  map.set(pricing.product.typeId, {
    bestBuy: map.get(pricing.product.typeId)?.bestBuy ?? null,
    bestSell: pricing.product.bestSell,
    pct5Buy: null,
    pct5Sell: null,
    buyVolume: null,
    sellVolume: null,
    source: null,
    staleAfterMs: pricing.product.staleAfterMs,
  });
  return map;
}

// A type needs refreshing if it has no price row, or its row-level stale_after
// has passed. A null price with a future stale_after is NOT stale — the last
// refresh confirmed there are simply no orders, which is still fresh data.
function isStale(p: PriceLite | undefined, now: number): boolean {
  return !p || p.staleAfterMs === null || p.staleAfterMs <= now;
}

interface PricingContextValue {
  pricing: BlueprintPricing | null;
  now: number | null;
  refreshing: boolean;
  // A row's confidence verdict, or null when prices/clock aren't ready yet or
  // the type has no price (badge withheld, exactly as 3.1.1's panel did).
  confidenceFor: (typeId: number) => RowConfidence | null;
  // The headline confidence over the cost-basis (raw) rows, for the hero.
  aggregate: AggregateConfidence | null;
}

const PricingContext = createContext<PricingContextValue | null>(null);

export function usePricing(): PricingContextValue {
  const ctx = useContext(PricingContext);
  if (!ctx) throw new Error('usePricing must be used within a PricingProvider');
  return ctx;
}

// Resolves the streamed pricing promise (the only component that waits on the
// price read) and seeds the store, then renders nothing. Isolated under its own
// <Suspense fallback={null}> so the wait never blocks the hero/cascade.
function PricingSeeder({
  pricingPromise,
  onSeed,
}: {
  pricingPromise: Promise<BlueprintPricing | null>;
  onSeed: (pricing: BlueprintPricing) => void;
}) {
  const resolved = use(pricingPromise);
  useEffect(() => {
    // Defer via a 0ms timer so setState isn't called synchronously from the
    // effect body (the established Cache-Components-safe shape).
    const t = setTimeout(() => {
      if (resolved) onSeed(resolved);
    }, 0);
    return () => clearTimeout(t);
  }, [resolved, onSeed]);
  return null;
}

export function PricingProvider({
  structure,
  pricingPromise,
  children,
}: {
  structure: BlueprintStructure;
  pricingPromise: Promise<BlueprintPricing | null>;
  children: ReactNode;
}) {
  const [pricing, setPricing] = useState<BlueprintPricing | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Client clock for freshness, filled after hydration so the static prerender
  // never reads the wall clock (Cache Components forbids it). Until then the
  // consumers withhold confidence badges, exactly like PriceFreshness.
  const [now, setNow] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  // Seed only the first snapshot; a refresh batch may already have advanced it.
  const seed = useCallback((initial: BlueprintPricing) => {
    setPricing((prev) => prev ?? initial);
  }, []);

  // Once seeded, top up stale/missing prices on demand — across the raw cost
  // basis, the product, and the buildable intermediates (their badges want a
  // fresh price too). Recompute the whole snapshot after each batch so margin
  // and every badge update as prices stream in. Runs once per blueprint load.
  useEffect(() => {
    if (!pricing || startedRef.current) return;
    startedRef.current = true;

    const nowMs = Date.now();
    const map = initialMap(pricing);
    const candidates = new Set<number>([
      ...structure.flatMaterials.map((m) => m.typeId),
      structure.product.typeId,
      ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
    ]);

    const stale = new Set<number>();
    for (const typeId of candidates) {
      if (isStale(map.get(typeId), nowMs)) stale.add(typeId);
    }
    if (stale.size === 0) return;

    const controller = new AbortController();
    const batches = chunk([...stale], ON_DEMAND_REFRESH_MAX_TYPE_IDS);

    (async () => {
      setRefreshing(true);
      try {
        for (const batch of batches) {
          const res = await fetch('/api/market-prices/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ typeIds: batch }),
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!res.ok) continue; // rate-limited / error → keep what we have
          const data = (await res.json()) as { prices: RefreshedPrice[] };
          for (const p of data.prices) {
            map.set(p.typeId, {
              bestBuy: p.bestBuy,
              bestSell: p.bestSell,
              pct5Buy: p.pct5Buy,
              pct5Sell: p.pct5Sell,
              buyVolume: p.buyVolume === null ? null : Number(p.buyVolume),
              sellVolume: p.sellVolume === null ? null : Number(p.sellVolume),
              source: p.source,
              staleAfterMs: Date.parse(p.staleAfter),
            });
          }
          setPricing(assemblePricing(structure, (t) => map.get(t)));
        }
      } catch {
        // aborted on unmount, or a network error — leave the last good state
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    })();

    return () => controller.abort();
  }, [pricing, structure]);

  const inputs = useMemo(
    () => (pricing ? buildConfidenceInputs(pricing) : null),
    [pricing],
  );

  const confidenceFor = useCallback(
    (typeId: number): RowConfidence | null => {
      if (now === null || !inputs) return null;
      const input = inputs.get(typeId);
      return input ? priceConfidence(input, now) : null;
    },
    [inputs, now],
  );

  const aggregate = useMemo<AggregateConfidence | null>(() => {
    if (!pricing || now === null) return null;
    return aggregateConfidence(
      pricing.rows.map((r) => ({
        source: r.source,
        buyVolume: r.buyVolume,
        unitBuy: r.unitBuy,
        staleAfterMs: r.staleAfterMs,
      })),
      now,
    );
  }, [pricing, now]);

  const value = useMemo<PricingContextValue>(
    () => ({ pricing, now, refreshing, confidenceFor, aggregate }),
    [pricing, now, refreshing, confidenceFor, aggregate],
  );

  return (
    <PricingContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <PricingSeeder pricingPromise={pricingPromise} onSeed={seed} />
      </Suspense>
    </PricingContext.Provider>
  );
}
