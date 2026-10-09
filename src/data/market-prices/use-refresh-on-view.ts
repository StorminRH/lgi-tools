'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import { chunk } from '@/lib/array';
import { refreshPricesEndpoint } from './api-contract';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from './constants';
import { toPlainPriceFigures } from './narrow';
import type { DepthBand, PriceSource, RegionalDiscount } from './types';

export interface RefreshedPrice {
  typeId: number;
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  buyDepth: DepthBand[] | null;
  sellDepth: DepthBand[] | null;
  regionalDiscount: RegionalDiscount | null;
  source: PriceSource;
  staleAfterMs: number;
}

export interface RefreshOnViewResult {
  prices: Map<number, RefreshedPrice>;
  isPending: (typeId: number) => boolean;
  refreshing: boolean;
}

// Prices this document refreshed, each kept until the server says it is stale.
// A page that mounts again shows them without asking again or flashing them
// pending; only the stale ones are refreshed.
const refreshed = new Map<number, RefreshedPrice>();

function freshPrices(typeIds: readonly number[], now: number): Map<number, RefreshedPrice> {
  const fresh = new Map<number, RefreshedPrice>();
  for (const typeId of typeIds) {
    const price = refreshed.get(typeId);
    if (price !== undefined && price.staleAfterMs > now) fresh.set(typeId, price);
  }
  return fresh;
}

/** One batch's refreshed prices: null when the server didn't answer, 'aborted' once the read is cancelled. */
async function readBatch(batch: number[], signal: AbortSignal): Promise<RefreshedPrice[] | 'aborted' | null> {
  const result = await apiFetch(refreshPricesEndpoint, { body: { typeIds: batch }, cache: 'no-store', signal });
  if (!result.ok) return result.kind === 'network' && result.aborted ? 'aborted' : null;
  return result.data.prices.map((p) => ({
    typeId: p.typeId,
    ...toPlainPriceFigures(p),
    source: p.source,
    staleAfterMs: Date.parse(p.staleAfter),
  }));
}

export function useRefreshOnView(
  typeIds: number[],
  opts: {
    enabled: boolean;
    onBatch?: (prices: Map<number, RefreshedPrice>) => void;
    // typeIds are read once per run on purpose: the planner's list changes on
    // every plan edit and must not refire refreshes. Changing this starts a
    // new run for the current typeIds, without a `key` remounting whatever
    // the caller renders around the hook.
    refreshKey?: string;
  },
): RefreshOnViewResult {
  const [prices, setPrices] = useState<Map<number, RefreshedPrice>>(() => new Map());
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);

  const typeIdsRef = useRef(typeIds);
  const onBatchRef = useRef(opts.onBatch);
  useEffect(() => {
    typeIdsRef.current = typeIds;
    onBatchRef.current = opts.onBatch;
  });

  const { enabled, refreshKey } = opts;

  useEffect(() => {
    if (!enabled) return;
    const wanted = [...new Set(typeIdsRef.current)];
    if (wanted.length === 0) return;
    const map = freshPrices(wanted, Date.now());
    const toRefresh = wanted.filter((typeId) => !map.has(typeId));

    const controller = new AbortController();
    const batches = chunk(toRefresh, ON_DEMAND_REFRESH_MAX_TYPE_IDS);
    const publish = () => {
      const snapshot = new Map(map);
      setPrices(snapshot);
      onBatchRef.current?.(snapshot);
    };

    const clearBatch = (batch: number[]) =>
      setPending((prev) => {
        const next = new Set(prev);
        for (const t of batch) next.delete(t);
        return next;
      });

    (async () => {
      if (map.size > 0) publish();
      if (toRefresh.length === 0) {
        setPending(new Set());
        setRefreshing(false);
        return;
      }
      setPending(new Set(toRefresh));
      setRefreshing(true);
      try {
        for (const batch of batches) {
          try {
            const prices = await readBatch(batch, controller.signal);
            if (prices === 'aborted') break;
            for (const price of prices ?? []) {
              map.set(price.typeId, price);
              refreshed.set(price.typeId, price);
            }
            if (prices !== null && !controller.signal.aborted) publish();
          } finally {
            if (!controller.signal.aborted) clearBatch(batch);
          }
        }
      } catch {
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
          setPending(new Set());
        }
      }
    })();

    return () => controller.abort();
  }, [enabled, refreshKey]);

  const isPending = useCallback((typeId: number) => pending.has(typeId), [pending]);

  return { prices, isPending, refreshing };
}
