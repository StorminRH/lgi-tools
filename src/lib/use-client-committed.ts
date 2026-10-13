import { useEffect } from 'react';
import { createClientStore, useClientStore } from './client-store';

const clientCommitted = createClientStore(false);

/**
 * False through SSR and the hydration render; true after the client commits.
 * The client snapshot stays false until that effect, so streaming hydration
 * keeps the session and server-status shell on the server HTML.
 */
export function useClientCommitted(): boolean {
  const committed = useClientStore(clientCommitted);
  useEffect(() => {
    clientCommitted.set(true);
  }, []);
  return committed;
}
