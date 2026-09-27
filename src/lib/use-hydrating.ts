import { useSyncExternalStore } from 'react';

function subscribe(): () => void {
  return () => {};
}

/**
 * True on the server and while React hydrates the calling component; false on
 * every client render after that, and React re-renders the component with
 * false as soon as its own hydration commits.
 *
 * It is per component, which a flag flipped after the root commits cannot be:
 * Next wraps every route segment in an Activity boundary, and React hydrates
 * Activity and Suspense boundaries on their own schedule, often after the root
 * has committed and client state (the session, preferences) has moved on.
 * Shared client state read through context must return its server value while
 * this is true, or a late boundary hydrates against state the server never
 * rendered, React throws #418, and the whole boundary is client-rendered.
 */
export function useHydrating(): boolean {
  return useSyncExternalStore(subscribe, () => false, () => true);
}
