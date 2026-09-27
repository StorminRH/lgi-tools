import { useSyncExternalStore } from 'react';

export interface ClientStore<T> {
  readonly get: () => T;
  readonly set: (next: T) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly serverValue: T;
}

/**
 * App-wide client state (the session, preferences) that a root component
 * publishes and any component reads with useClientStore.
 *
 * Do not put state like this in a context value. Next wraps every route
 * segment in an Activity boundary, and React hydrates those and Suspense
 * boundaries after the root commits. A context value that changes while a
 * boundary is still dehydrated marks that boundary as updated: React either
 * hydrates it against the new value, which mismatches the server HTML (#418),
 * or throws the server HTML away and client-renders it. Either way painted UI
 * is replaced. A store reaches only components that already hydrated, and each
 * reader hydrates against `serverValue`, then re-renders with the live value.
 */
export function createClientStore<T>(serverValue: T): ClientStore<T> {
  let value = serverValue;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    serverValue,
  };
}

export function useClientStore<T>(store: ClientStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.serverValue);
}
