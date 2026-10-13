'use client';

import { useEffect, useEffectEvent } from 'react';
import { dedupe } from '@/lib/array';
import { apiFetch } from '@/transport/api-client';
import { refreshHistoryEndpoint } from './api-contract';
import type { MarketHistoryInputs } from './types';

export function useRefreshHistoryOnView(
  typeIds: number[],
  opts: {
    enabled: boolean;
    onResult: (inputs: Map<number, MarketHistoryInputs>) => void;
  },
): void {
  const { enabled, onResult } = opts;
  // typeIds are read once per run, and only `enabled` starts a run.
  const readIds = useEffectEvent(() => dedupe(typeIds));
  const emitResult = useEffectEvent(onResult);

  useEffect(() => {
    if (!enabled) return;
    const ids = readIds();
    if (ids.length === 0) return;

    const controller = new AbortController();
    (async () => {
      const result = await apiFetch(refreshHistoryEndpoint, {
        body: { typeIds: ids },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!result.ok || controller.signal.aborted) return;
      const map = new Map<number, MarketHistoryInputs>();
      for (const i of result.data.inputs) map.set(i.typeId, i);
      emitResult(map);
    })();

    return () => controller.abort();
  }, [enabled]);
}
