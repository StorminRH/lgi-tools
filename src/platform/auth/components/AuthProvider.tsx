'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { useClientCommitted } from '@/lib/use-client-committed';
import { authClient } from '../auth-client';
import { writeSignedInHint } from '../signed-in-hint';
import { publishReadIdentity } from '../read-identity';
import { HELD_AUTH_STATE, resolveAuthState, type AuthState } from './auth-state';

const authStore = createClientStore<AuthState>(HELD_AUTH_STATE);

// Resolves the session and publishes it to a client store, not a context
// value: see createClientStore for why resolving it must not reach
// boundaries that are still hydrating.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const clientCommitted = useClientCommitted();
  const [settled, setSettled] = useState(false);
  if (!settled && clientCommitted && !isPending) setSettled(true);

  const session = data ?? null;
  const state = useMemo(
    () => resolveAuthState(clientCommitted, session, isPending, settled),
    [clientCommitted, session, isPending, settled],
  );

  useLayoutEffect(() => {
    publishReadIdentity(state.session === null || data === null ? null : {
      userId: data.user.id,
      characterId: state.session.characterId,
    });
    authStore.set(state);
  }, [state, data]);

  const signedIn = state.session !== null;
  useEffect(() => {
    if (!state.loading) writeSignedInHint(signedIn);
  }, [state.loading, signedIn]);

  return children;
}

export function useAuth(): AuthState {
  return useClientStore(authStore);
}
