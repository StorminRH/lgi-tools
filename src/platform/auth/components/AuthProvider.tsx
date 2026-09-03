'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import { authClient } from '../auth-client';
import { resolveAuthState, type AuthState } from './auth-state';

const AuthContext = createContext<AuthState | null>(null);

function subscribeNever() {
  return () => {};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const clientCommitted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const state = resolveAuthState(clientCommitted, data ?? null, isPending);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
