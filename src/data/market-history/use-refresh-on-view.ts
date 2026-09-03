'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import { refreshHistoryEndpoint } from './api-contract';
import type { MarketHistoryInputs } from './types';

export interface HistoryOnViewResult {
  inputs: Map<number, MarketHistoryInputs>;
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
        if (!result.ok) return;
        const map = new Map<number, MarketHistoryInputs>();
        for (const i of result.data.inputs) map.set(i.typeId, i);
        if (!controller.signal.aborted) {
          setInputs(map);
          onResultRef.current?.(map);
        }
      } catch {
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    })();

    return () => controller.abort();
  }, [enabled]);

  return { inputs, refreshing };
}
