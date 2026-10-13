'use client';

import { useCallback } from 'react';
import { type ClientStore, createClientStore, useClientStore } from '@/lib/client-store';
import { useResourceRead } from '@/lib/use-resource-read';
import {
  isCurrentReadIdentity,
  type ReadIdentity,
  subscribeReadIdentity,
  useReadIdentity,
} from '@/platform/auth/read-identity';

/**
 * The last result a client read produced, kept outside the component that
 * asked for it. Next keeps only a few visited routes alive, so a page the
 * pilot returns to often mounts fresh: drawing what it last showed, then
 * refreshing quietly, keeps navigation from replaying skeletons.
 *
 * Account or active-character changes clear it even when another tab changes
 * the session. A write belongs to the identity that started its request.
 */
export interface RememberedRead<T> extends Omit<ClientStore<T | null>, 'set'> {
  set: (next: T | null, identity: ReadIdentity | null) => void;
}

export function createRememberedRead<T>(): RememberedRead<T> {
  const store = createClientStore<T | null>(null);
  let owner: ReadIdentity | null = null;
  subscribeReadIdentity(() => {
    owner = null;
    store.set(null);
  });
  return {
    ...store,
    get: () => isCurrentReadIdentity(owner) ? store.get() : null,
    set(next, identity) {
      if (!isCurrentReadIdentity(identity)) return;
      owner = identity;
      store.set(next);
    },
  };
}

/** The last result. Hydrates as nothing, like the server render. */
export function useRememberedRead<T>(memory: RememberedRead<T>): T | null {
  return useClientStore(memory);
}

/**
 * The last result, refreshed by one read for each signed-in identity while
 * `enabled`, and again whenever `refreshKey` changes. Only the latest read
 * lands, and only for the identity that started it; unmounting aborts it.
 * `read` must keep its identity between renders (module level or a
 * useCallback), and resolves null to keep what is drawn.
 */
export function useRememberedResource<T>(
  memory: RememberedRead<T>,
  read: (signal: AbortSignal) => Promise<T | null>,
  opts: { enabled?: boolean; refreshKey?: number } = {},
): T | null {
  const { enabled = true, refreshKey } = opts;
  const remembered = useRememberedRead(memory);
  const identity = useReadIdentity();
  // A new identity is a new writer, which starts the read again.
  const onData = useCallback((next: T) => memory.set(next, identity), [memory, identity]);
  useResourceRead(read, { enabled: enabled && identity !== null, onData, refreshKey });
  return remembered;
}
