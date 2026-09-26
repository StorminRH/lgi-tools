'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useClientCommitted } from '@/lib/use-client-committed';
import { authClient } from '../auth-client';
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

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
