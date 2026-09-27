'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import type { EndpointContract, JsonCodec } from '@/transport/endpoint';
import { loadFailureStep, RECONCILE_ONCE, reconcileDelay } from '@/lib/live-dataset';

const TICK_MS = 30_000;
const RETRY_DELAY_MS = 4_000;

/** What every live-dataset hook hands its consumers besides the derived rows. */
export interface LiveDatasetState {
  names: Record<string, string>;
  now: number;
  loading: boolean;
  failed: boolean;
}

export function useLiveDataset<TResponse, TKey extends string | boolean>(
  endpoint: EndpointContract<null, { 200: JsonCodec<TResponse> }> & {
    method: 'GET';
  },
  coldKey: TKey,
  isCold: (response: TResponse, key: TKey) => boolean,
  // Refetch delays while the data is still cold. The default reconciles once;
  // a dataset whose first sync is slow can pass a longer, bounded backoff.
  // Pass a module-level array: it is an effect dependency.
  reconcileSchedule: readonly number[] = RECONCILE_ONCE,
): { response: TResponse | null; now: number; loading: boolean; failed: boolean } {
  const [response, setResponse] = useState<TResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // Outlives effect re-runs, like `response`: once data is on screen, a later
  // run's failures keep it instead of replacing it with the failure line.
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let retried = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay: number) => {
      timer = setTimeout(() => void load(), delay);
    };

    // A failed fetch must still settle the dataset: one delayed retry, then
    // `failed`, so consumers can swap their loading state for an error line.
    const onFailure = () => {
      const step = loadFailureStep(loaded.current, retried);
      if (step === 'retry') {
        retried = true;
        schedule(RETRY_DELAY_MS);
      } else if (step === 'fail') {
        setFailed(true);
      }
    };

    const load = async () => {
      const result = await apiFetch(endpoint);
      if (cancelled) return;
      if (!result.ok) {
        onFailure();
        return;
      }
      loaded.current = true;
      setResponse(result.data);
      setFailed(false);
      const delay = reconcileDelay(attempt, result.data, coldKey, isCold, reconcileSchedule);
      if (delay !== null) {
        attempt += 1;
        schedule(delay);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [endpoint, coldKey, isCold, reconcileSchedule]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { response, now, loading: response === null && !failed, failed };
}
