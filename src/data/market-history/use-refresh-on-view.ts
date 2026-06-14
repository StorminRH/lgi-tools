'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { refreshHistoryEndpoint } from './api-contract';
import type { MarketHistoryInputs } from './types';

// Client half of the history refresh-on-view engine. Hand it a set of type IDs
// (the planner passes the one product type) and an `enabled` gate; it confirms
// each one live through POST /api/market-history/refresh, which runs the
// stale-gated server engine behind the route. Mirrors the price hook's one-shot
// `enabled` false→true trigger, minus the per-item pending/flash (no live UI in
// 3.5.3a — the score UI is 3.5.3b's; this populates the store/warms the data).

export interface HistoryOnViewResult {
  // Freshest inputs per type once the refresh lands; empty until then.
  inputs: Map<number, MarketHistoryInputs>;
  // True for the duration of the refresh request.
  refreshing: boolean;
}

export function useRefreshHistoryOnView(
  typeIds: number[],
  opts: {
    enabled: boolean;
    onResult?: (inputs: Map<number, MarketHistoryInputs>) => void;
  },
): HistoryOnViewResult {
  const [inputs, setInputs] = useState<Map<number, MarketHistoryInputs>>(() => new Map());
  const [refreshing, setRefreshing] = useState(false);

  // Read the latest ids/callback from inside the trigger effect without making
  // them its dependencies — the loop is keyed on `enabled` alone and captures
  // whatever set is current when it fires (the price-hook pattern).
  const typeIdsRef = useRef(typeIds);
  const onResultRef = useRef(opts.onResult);
  useEffect(() => {
    typeIdsRef.current = typeIds;
    onResultRef.current = opts.onResult;
  });

  const { enabled } = opts;

  useEffect(() => {
    if (!enabled) return;
    const ids = [...new Set(typeIdsRef.current)];
    if (ids.length === 0) return;

    const controller = new AbortController();
    (async () => {
      setRefreshing(true);
      try {
        const result = await apiFetch(refreshHistoryEndpoint, {
          body: { typeIds: ids },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!result.ok) return; // rate-limited / error → leave the last state
        const map = new Map<number, MarketHistoryInputs>();
        for (const i of result.data.inputs) map.set(i.typeId, i);
        if (!controller.signal.aborted) {
          setInputs(map);
          onResultRef.current?.(map);
        }
      } catch {
        // aborted on unmount, or a network error — leave the last good state
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    })();

    return () => controller.abort();
  }, [enabled]);

  return { inputs, refreshing };
}
