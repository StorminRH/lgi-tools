'use client';

import { type ClientStore, createClientStore, useClientStore } from '@/lib/client-store';
import {
  currentReadIdentity,
  type ReadIdentity,
  subscribeReadIdentity,
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
    get: () => owner !== null && owner === currentReadIdentity() ? store.get() : null,
    set(next, identity) {
      if (identity === null || identity !== currentReadIdentity()) return;
      owner = identity;
      store.set(next);
    },
  };
}

/** The last result. Hydrates as nothing, like the server render. */
export function useRememberedRead<T>(memory: RememberedRead<T>): T | null {
  return useClientStore(memory);
}
