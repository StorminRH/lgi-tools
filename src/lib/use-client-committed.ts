import { useSyncExternalStore } from 'react';

function subscribeNever(): () => void {
  return () => {};
}

/** False during SSR and hydration; true after the client commits. */
export function useClientCommitted(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
