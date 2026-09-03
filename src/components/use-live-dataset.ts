'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import type { EndpointContract, JsonCodec } from '@/transport/endpoint';
import { shouldReconcile } from '@/lib/live-dataset';

const TICK_MS = 30_000;

const RECONCILE_DELAY_MS = 4_000;

export function useLiveDataset<TResponse, TKey extends string | boolean>(
  endpoint: EndpointContract<null, { 200: JsonCodec<TResponse> }> & {
    method: 'GET';
  },

  coldKey: TKey,

  isCold: (response: TResponse, key: TKey) => boolean,
): { response: TResponse | null; now: number; loading: boolean } {
  const [response, setResponse] = useState<TResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconciled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const result = await apiFetch(endpoint);
      if (cancelled || !result.ok) return;
      setResponse(result.data);

      if (shouldReconcile(reconciled, result.data, coldKey, isCold)) {
        reconciled = true;
        timer = setTimeout(() => void load(), RECONCILE_DELAY_MS);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [endpoint, coldKey, isCold]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { response, now, loading: response === null };
}
