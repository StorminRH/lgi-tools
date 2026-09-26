'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useClientCommitted } from '@/lib/use-client-committed';
import { authClient } from '../auth-client';
import { writeSignedInHint } from '../signed-in-hint';
import { resolveAuthState, type AuthState } from './auth-state';

const AuthContext = createContext<AuthState | null>(null);

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

  const signedIn = state.session !== null;
  useEffect(() => {
    if (!state.loading) writeSignedInHint(signedIn);
  }, [state.loading, signedIn]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
