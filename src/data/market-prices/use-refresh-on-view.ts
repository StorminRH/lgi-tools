'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from './constants';
import type { PriceSource } from './types';

// The client half of the refresh-on-view engine — the generic fetch loop every
// live-price consumer shares. It knows nothing about blueprints or sites: hand
// it a set of type IDs and an `enabled` gate, and it confirms each one live
// through POST /api/market-prices/refresh, tracking which are still in flight so
// the UI can dim-then-flash them. The server engine (refresh-on-view.ts) does
// the ESI/Fuzzwork fetch + coalescing behind that route; this owns only the
// batching, the pending set, and clean cancellation.
//
// Two consumers today: the Industry Planner's PricingProvider (which recomputes
// its margin from each batch via `onBatch`) and the wormhole sites' resource
// island (which just reads `prices`). Both get identical refresh visuals because
// both run this one loop.

// A live price after client-side deserialization: the wire shape (DB-bigint
// volumes as strings, stale_after as an ISO string) narrowed to plain numbers.
export interface RefreshedPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  source: PriceSource;
  staleAfterMs: number;
}

// The raw `prices` array shape returned by POST /api/market-prices/refresh.
interface WirePrice {
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

export interface RefreshOnViewResult {
  // Freshest confirmed value per type, accumulated across batches. Empty until
  // the first batch lands; a type missing here simply has no live value yet.
  prices: Map<number, RefreshedPrice>;
  // True while a type is awaiting its live confirmation — the dimmed→flash
  // signal: dim the seed + show the loading badge while pending, flash when it
  // lands.
  isPending: (typeId: number) => boolean;
  // True for the duration of the refresh loop.
  refreshing: boolean;
  // Latches true once a real pending cycle has started, so the settle pulse only
  // plays after a genuine shimmer — never on an already-fresh first paint.
  everPending: boolean;
}

export function useRefreshOnView(
  typeIds: number[],
  opts: { enabled: boolean; onBatch?: (prices: Map<number, RefreshedPrice>) => void },
): RefreshOnViewResult {
  const [prices, setPrices] = useState<Map<number, RefreshedPrice>>(() => new Map());
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [everPending, setEverPending] = useState(false);

  // Read the latest type IDs / callback from inside the trigger effect without
  // making them its dependencies — the loop is keyed on `enabled` alone (see
  // below) and captures whatever set is current at the moment it fires. Synced
  // in an effect (not during render) so the refs are fresh before the trigger
  // effect, which is declared after this one, runs on the same commit.
  const typeIdsRef = useRef(typeIds);
  const onBatchRef = useRef(opts.onBatch);
  useEffect(() => {
    typeIdsRef.current = typeIds;
    onBatchRef.current = opts.onBatch;
  });

  const { enabled } = opts;

  // Run the loop once when `enabled` flips false→true. Keyed on `enabled`, NOT
  // on `prices`: each batch calls setPrices, and if the price map were a
  // dependency React would run this effect's cleanup (controller.abort())
  // between batches and strand the loop mid-sequence. With `enabled` deps the
  // loop starts once and the abort fires only on unmount. Set-state happens
  // inside the async body (not the effect body) so the set-state-in-effect lint
  // stays satisfied.
  useEffect(() => {
    if (!enabled) return;
    const toRefresh = [...new Set(typeIdsRef.current)];
    if (toRefresh.length === 0) return;

    const controller = new AbortController();
    const batches = chunk(toRefresh, ON_DEMAND_REFRESH_MAX_TYPE_IDS);
    const map = new Map<number, RefreshedPrice>();

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
      setPending(new Set(toRefresh));
      setEverPending(true);
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
            const data = (await res.json()) as { prices: WirePrice[] };
            for (const p of data.prices) {
              map.set(p.typeId, {
                typeId: p.typeId,
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
            if (!controller.signal.aborted) {
              const snapshot = new Map(map);
              setPrices(snapshot);
              onBatchRef.current?.(snapshot);
            }
          } finally {
            if (!controller.signal.aborted) clearBatch(batch);
          }
        }
      } catch {
        // aborted on unmount, or a network error — leave the last good state
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
          // Drain anything the loop never reached (a thrown error breaks out
          // mid-sequence) so those rows fall back to their dimmed seed instead
          // of spinning forever.
          setPending(new Set());
        }
      }
    })();

    return () => controller.abort();
  }, [enabled]);

  const isPending = useCallback((typeId: number) => pending.has(typeId), [pending]);

  return { prices, isPending, refreshing, everPending };
}
