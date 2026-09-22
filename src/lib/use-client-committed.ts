import { useEffect, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let released = false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clientSnapshot(): boolean {
  return released;
}

function serverSnapshot(): boolean {
  return false;
}

function release(): void {
  if (released) return;
  released = true;
  for (const listener of [...listeners]) listener();
}

/**
 * False through SSR and the hydration render; true after the client commits.
 * The client snapshot stays false until that effect, so streaming hydration
 * keeps the session and server-status shell on the server HTML.
 */
export function useClientCommitted(): boolean {
  const committed = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  useEffect(release, []);
  return committed;
}
