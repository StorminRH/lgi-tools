'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import type { UpdateMapAccessRequest } from '@/data/maps/api-contract';
import { mapAccessFailureMessage, updateMapAccess } from './map-access-client';

/**
 * Local rows seeded from server props. When `revision` changes, as a server
 * refresh brings new rows, the draft is seeded again during render, with the
 * current draft passed so `seed` can keep rows the server does not hold yet.
 * New props with the same revision keep the draft, so a caller that builds a
 * fresh array each render does not reset it.
 */
export function useServerDraft<S, D>(
  server: S,
  revision: string,
  seed: (server: S, current: D | null) => D,
): [D, Dispatch<SetStateAction<D>>] {
  const [draft, setDraft] = useState(() => seed(server, null));
  const [applied, setApplied] = useState(revision);
  if (applied !== revision) {
    setApplied(revision);
    setDraft((current) => seed(server, current));
  }
  return [draft, setDraft];
}

/**
 * One editor's map access writes. `busy` holds the key of the write in flight
 * and `error` the last failure's message. A saved write applies `onOk` to the
 * local draft, then refreshes the server rows.
 */
export function useMapAccessWrite<K>(): {
  readonly busy: K | null;
  readonly error: string | null;
  readonly clearError: () => void;
  readonly run: (key: K, request: UpdateMapAccessRequest, onOk: () => void) => Promise<void>;
} {
  const router = useRouter();
  const [busy, setBusy] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: K, request: UpdateMapAccessRequest, onOk: () => void) {
    setBusy(key);
    setError(null);
    const outcome = await updateMapAccess(request);
    setBusy(null);
    if (!outcome.ok) {
      setError(mapAccessFailureMessage(outcome));
      return;
    }
    onOk();
    router.refresh();
  }

  return { busy, error, clearError: () => setError(null), run };
}
