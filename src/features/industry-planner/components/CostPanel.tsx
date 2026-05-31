'use client';

import { useEffect, useState } from 'react';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from '@/data/market-prices/constants';
import type { PriceSource } from '@/data/market-prices/types';
import { assemblePricing, type PriceLite } from '../build-pricing';
import type { BlueprintPricing, BlueprintStructure } from '../types';
import { CostPanelView } from './CostPanelView';

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

// Live price map seeded from the server's initial snapshot. Each row carries
// its row-level stale_after, so the client decides staleness and recomputes
// margin without re-reading the DB.
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
// refresh confirmed there are simply no orders, which is still fresh data, so
// we don't re-fetch it on every visit. (Matches the cron's `stale_after < NOW()`
// contract; works for buy-side materials and the sell-side product alike.)
function isStale(p: PriceLite | undefined, now: number): boolean {
  return !p || p.staleAfterMs === null || p.staleAfterMs <= now;
}

// Client wrapper around the cost panel. On mount it finds the stale/missing
// type IDs, refreshes them on demand through /api/market-prices/refresh in
// chunks of ON_DEMAND_REFRESH_MAX_TYPE_IDS (a deep tree like an Archon exceeds
// the cap), and recomputes the panel after each batch returns — so prices
// stream in as they arrive rather than blocking the page on ESI.
export function CostPanel({
  initialPricing,
  structure,
}: {
  initialPricing: BlueprintPricing;
  structure: BlueprintStructure;
}) {
  const [pricing, setPricing] = useState(initialPricing);
  const [refreshing, setRefreshing] = useState(false);
  // Client clock for freshness, filled after hydration so the static prerender
  // never reads the wall clock (Cache Components forbids it). Until then the
  // view withholds confidence badges, exactly like PriceFreshness.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Defer via a 0ms timer so setState isn't called synchronously in the
    // effect body (same shape as PriceFreshness's clock read).
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const nowMs = Date.now();
    const map = initialMap(initialPricing);

    const stale = new Set<number>();
    for (const m of structure.flatMaterials) {
      if (isStale(map.get(m.typeId), nowMs)) stale.add(m.typeId);
    }
    if (isStale(map.get(structure.product.typeId), nowMs)) {
      stale.add(structure.product.typeId);
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
    // Run once per blueprint load; props are stable for that load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CostPanelView pricing={pricing} structure={structure} refreshing={refreshing} now={now} />
  );
}
