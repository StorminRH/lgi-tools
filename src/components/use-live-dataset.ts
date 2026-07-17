'use client';

// The client live-tracker platform (Family-1 generalization). Every per-owner live
// surface (personal industry jobs, skill queue, corp jobs) shares the same shell: fetch
// the dataset once on view from its GET endpoint, one delayed reconcile re-fetch to pick
// up the on-view write-behind's first payload, and a render clock that ticks so the
// client-side countdowns stay honest with NO data traffic. This hook owns that shell; a
// thin per-slice hook supplies its endpoint, a primitive reload key, and a MODULE-LEVEL
// cold predicate, then derives its own view-model from { response, now }. Lives in
// src/components (an unzoned .ts, like use-account-characters.ts) so both feature slices
// consume it without importing each other; it imports only lib.
import { useEffect, useState } from 'react';
import { type ApiEndpoint, apiFetch } from '@/lib/api-client';
import { shouldReconcile } from '@/lib/live-dataset';

// Re-render cadence for the client-side timestamp math — countdowns and the ready flip
// stay honest without any data traffic.
const TICK_MS = 30_000;
// One delayed reconcile to pick up the on-view write-behind's first payload.
const RECONCILE_DELAY_MS = 4_000;

/**
 * Encapsulates the live dataset subscription and state lifecycle; callers provide lookup keys
 * where required and render the returned state.
 */
export function useLiveDataset<TResponse, TKey extends string | boolean>(
  endpoint: ApiEndpoint<null, TResponse>,
  // The primitive reload key: a change re-runs the load. Character trackers pass the
  // deduped eligible-id string; the corp tracker passes a "has eligible" boolean.
  coldKey: TKey,
  // Whether the fetched dataset is still cold (the on-view write-behind hasn't populated
  // Neon yet), so one reconcile re-fetch is due. MUST be module-level for a stable effect
  // dependency — an inline closure would re-run the load every render.
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
      // Still cold ⇒ the write-behind is populating Neon; re-fetch ONCE to surface it.
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
