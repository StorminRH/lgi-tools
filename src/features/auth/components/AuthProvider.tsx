'use client';

// Client-side identity provider. The root layout no longer reads the session
// cookie at render time (3.0.4.7) — instead this provider fetches the viewer's
// identity from /api/auth/me once on mount and shares it via context, so the
// header and feedback modal can fill in login state after the static shell
// paints. `loading` is true until the first fetch resolves; consumers render a
// neutral state during that window rather than flashing logged-out.
//
// Pure client: imports only React + the shared Session type. It must never pull
// in getSession()/the DB — those are server-only.

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '../types';

export interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json() as Promise<{ session: Session | null; isAdmin: boolean }>)
      .then((data) => {
        if (cancelled) return;
        setState({ session: data.session, isAdmin: data.isAdmin, loading: false });
      })
      .catch(() => {
        // Network/parse failure → treat the viewer as logged out, stop loading.
        if (cancelled) return;
        setState({ session: null, isAdmin: false, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
