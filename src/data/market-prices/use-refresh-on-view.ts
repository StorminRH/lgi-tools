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

export function useRefreshOnView(
  typeIds: number[],
  opts: { enabled: boolean; onBatch?: (prices: Map<number, RefreshedPrice>) => void },
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

  const { enabled } = opts;

  useEffect(() => {
    if (!enabled) return;
    const toRefresh = [...new Set(typeIdsRef.current)];
    if (toRefresh.length === 0) return;

    const controller = new AbortController();
    const batches = chunk(toRefresh, ON_DEMAND_REFRESH_MAX_TYPE_IDS);
    const map = new Map<number, RefreshedPrice>();

    const clearBatch = (batch: number[]) =>
      setPending((prev) => {
        const next = new Set(prev);
        for (const t of batch) next.delete(t);
        return next;
      });

    (async () => {
      setPending(new Set(toRefresh));
      setRefreshing(true);
      try {
        for (const batch of batches) {
          try {
            const result = await apiFetch(refreshPricesEndpoint, {
              body: { typeIds: batch },
              cache: 'no-store',
              signal: controller.signal,
            });
            if (!result.ok) {
              if (result.kind === 'network' && result.aborted) break;
              continue;
            }
            for (const p of result.data.prices) {
              map.set(p.typeId, {
                typeId: p.typeId,
                ...toPlainPriceFigures(p),
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
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
          setPending(new Set());
        }
      }
    })();

    return () => controller.abort();
  }, [enabled]);

  const isPending = useCallback((typeId: number) => pending.has(typeId), [pending]);

  return { prices, isPending, refreshing };
}
