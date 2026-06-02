'use client';

import {
  createContext,
  Suspense,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from '@/data/market-prices/constants';
import type { PriceSource } from '@/data/market-prices/types';
import {
  assemblePricing,
  collectIntermediateTypeIds,
  type PriceLite,
} from '../build-pricing';
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

interface PricingContextValue {
  pricing: BlueprintPricing | null;
  // True once the streamed price read has settled — distinguishes "still
  // loading" (false) from "resolved, but no pricing available" (true +
  // pricing === null), so consumers don't show a perpetual loading state.
  seeded: boolean;
  refreshing: boolean;
  // True while a type is awaiting its live confirmation — every viewed type is
  // refreshed on view, so this is the dimmed→flash signal: dim the seed and show
  // the loading badge while pending, then flash to the toned value when it lands.
  isPending: (typeId: number) => boolean;
  // Pending over the cost-basis (raw) rows, for the hero's dimmed→flash margin.
  aggregatePending: boolean;
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
  onSeed: (pricing: BlueprintPricing | null) => void;
}) {
  const resolved = use(pricingPromise);
  useEffect(() => {
    // Defer via a 0ms timer so setState isn't called synchronously from the
    // effect body (the established Cache-Components-safe shape). Always reports
    // the result — including null — so the store can settle into an
    // "unavailable" state rather than loading forever.
    const t = setTimeout(() => onSeed(resolved), 0);
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
  const [seeded, setSeeded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Type IDs still awaiting their live confirmation. Seeded to the full
  // refresh set when the loop starts and drained one batch at a time, so each
  // row knows when to stop being dimmed and flash to its toned value.
  const [pending, setPending] = useState<Set<number>>(() => new Set());

  // Settle the store from the streamed read. Mark it seeded either way (so a
  // null result reads as "unavailable", not "loading"); only adopt a non-null
  // snapshot, and only the first one — a refresh batch may already have
  // advanced it.
  const seed = useCallback((initial: BlueprintPricing | null) => {
    setSeeded(true);
    if (initial) setPricing((prev) => prev ?? initial);
  }, []);

  // Once seeded, re-confirm every viewed price live on view — across the raw
  // cost basis, the product, and the buildable intermediates. We refresh the
  // whole set, not just stale rows: the seed is always shown dimmed as the
  // last-known and each row flashes to its confirmed value as the batch lands
  // (the engine's per-item coalescing makes a fresh item cache-hit and flash
  // back near-instantly, so always-refresh stays cheap). Recompute the whole
  // snapshot after each batch so margin and every badge update as prices stream
  // in.
  //
  // Keyed on `seeded` (a one-shot false→true), NOT on `pricing`: each batch
  // calls setPricing, and if `pricing` were a dependency React would run this
  // effect's cleanup (controller.abort()) between batches and kill the in-flight
  // loop — stranding deep builds (e.g. an Archon, >1 batch) after the first
  // batch with `refreshing` stuck true. With `seeded` deps the loop starts once
  // when the seed lands and the abort fires only on unmount. `pricing` here is
  // the seed snapshot captured at that transition; `structure` is a stable prop.
  useEffect(() => {
    if (!pricing) return;

    const map = initialMap(pricing);
    const toRefresh = [
      ...new Set<number>([
        ...structure.flatMaterials.map((m) => m.typeId),
        structure.product.typeId,
        ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
      ]),
    ];
    if (toRefresh.length === 0) return;

    const controller = new AbortController();
    const batches = chunk(toRefresh, ON_DEMAND_REFRESH_MAX_TYPE_IDS);

    // Drop a whole batch from `pending` once its request settles — whatever the
    // engine couldn't price simply falls back to its dimmed seed, so a row never
    // spins forever (covers rate-limit, partial responses, and network errors).
    const clearBatch = (batch: number[]) =>
      setPending((prev) => {
        const next = new Set(prev);
        for (const t of batch) next.delete(t);
        return next;
      });

    (async () => {
      // Mark the whole set pending up front (inside the async body, not the
      // effect body, so the set-state-in-effect lint stays satisfied) — every
      // viewed row shows its dimmed seed + loading badge until its batch lands.
      setPending(new Set(toRefresh));
      setRefreshing(true);
      try {
        for (const batch of batches) {
          try {
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
          } finally {
            if (!controller.signal.aborted) clearBatch(batch);
          }
        }
      } catch {
        // aborted on unmount, or a network error — leave the last good state
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
          // Drain anything the loop never reached — a thrown error breaks out of
          // it mid-sequence — so those rows fall back to their dimmed seed
          // instead of spinning forever (the per-batch finally only covers the
          // batch that was in flight).
          setPending(new Set());
        }
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded]);

  const isPending = useCallback((typeId: number) => pending.has(typeId), [pending]);

  const aggregatePending = useMemo(
    () => (pricing ? pricing.rows.some((r) => pending.has(r.typeId)) : pending.size > 0),
    [pricing, pending],
  );

  const value = useMemo<PricingContextValue>(
    () => ({ pricing, seeded, refreshing, isPending, aggregatePending }),
    [pricing, seeded, refreshing, isPending, aggregatePending],
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
