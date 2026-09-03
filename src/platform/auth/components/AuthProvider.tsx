'use client';

// Client-side identity provider. The root layout doesn't read the session at
// render time (3.0.4.7) — this provider subscribes to Better Auth's session via
// useSession() and shares it through context, so the header and feedback modal
// fill in login state after the static shell paints.
//
// The published snapshot stays frozen (`session: null`, `loading: true`) through
// SSR and the first client render. useState(false) plus a post-commit effect is
// the documented two-pass. Session stays withheld until that release and while
// Better Auth is pending, so consumers that ignore `loading` cannot paint a
// different first tree than the server.
//
// The AuthState shape (session/isAdmin/loading) is unchanged from the pre-3.4.1
// /api/auth/me version, so every consumer (LoginButton, GlobalSearch,
// FeedbackButton) is untouched. isAdmin is computed server-side by the
// customSession plugin (its superadmin branch reads an env var) and arrives via
// useSession().

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
