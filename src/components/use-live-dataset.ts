'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import type { EndpointContract, JsonCodec } from '@/transport/endpoint';
import { loadFailureStep, RECONCILE_ONCE, reconcileDelay } from '@/lib/live-dataset';
import { currentReadIdentity, useReadIdentity } from '@/platform/auth/read-identity';
import { createRememberedRead, type RememberedRead, useRememberedRead } from './remembered-read';

const TICK_MS = 30_000;
const RETRY_DELAY_MS = 4_000;

/** What every live-dataset hook hands its consumers besides the derived rows. */
export interface LiveDatasetState {
  names: Record<string, string>;
  now: number;
  loading: boolean;
  failed: boolean;
  /** Starts the read again after it failed. */
  retry: () => void;
}

// One remembered response per endpoint, shared by every reader of it.
const memories = new Map<string, RememberedRead<unknown>>();

function memoryFor<TResponse>(path: string): RememberedRead<TResponse> {
  let memory = memories.get(path);
  if (memory === undefined) {
    memory = createRememberedRead<unknown>();
    memories.set(path, memory);
  }
  return memory as RememberedRead<TResponse>;
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
): { response: TResponse | null } & Omit<LiveDatasetState, 'names'> {
  // The last response outlives this component, so a page that mounts again
  // draws it at once and refreshes quietly. Once data is on screen, a later
  // failure keeps it instead of replacing it with the failure line.
  const memory = memoryFor<TResponse>(endpoint.path);
  const response = useRememberedRead(memory);
  const identity = useReadIdentity();
  const [failure, setFailure] = useState<typeof identity>(null);
  const failed = identity !== null && failure === identity;
  // Bumped by retry so the load effect runs again from the start.
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (identity === null) return;
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
      const step = loadFailureStep(memory.get() !== null, retried);
      if (step === 'retry') {
        retried = true;
        schedule(RETRY_DELAY_MS);
      } else if (step === 'fail') {
        setFailure(identity);
      }
    };

    const load = async () => {
      const result = await apiFetch(endpoint);
      if (cancelled || identity !== currentReadIdentity()) return;
      if (!result.ok) {
        onFailure();
        return;
      }
      memory.set(result.data, identity);
      setFailure(null);
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
  }, [endpoint, memory, identity, coldKey, isCold, reconcileSchedule, attempts]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempts((n) => n + 1);
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { response, now, loading: response === null && !failed, failed, retry };
}
