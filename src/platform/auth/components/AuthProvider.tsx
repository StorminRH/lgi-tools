'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { authClient } from '../auth-client';
import { resolveAuthState, type AuthState } from './auth-state';

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [released, setReleased] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration two-pass
    setReleased(true);
  }, []);

  const state = resolveAuthState(released, data ?? null, isPending);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
