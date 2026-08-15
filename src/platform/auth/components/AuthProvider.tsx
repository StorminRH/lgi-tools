'use client';

// Client-side identity provider. The root layout doesn't read the session at
// render time (3.0.4.7) — this provider subscribes to Better Auth's session via
// useSession() and shares it through context, so the header and feedback modal
// fill in login state after the static shell paints.
//
// The published snapshot stays frozen (`session: null`, `loading: true`) through
// SSR and the hydration commit. A `true`/`false` useSyncExternalStore pair is
// the wrong hold: React 19 hydrates from getServerSnapshot, and a differing
// getSnapshot is a recovery-path mismatch. useState(false) + a post-commit
// effect is the documented two-pass. Session is also withheld while Better Auth
// is pending, so consumers that ignore `loading` cannot leak a client-only tree.
//
// The AuthState shape (session/isAdmin/loading) is unchanged from the pre-3.4.1
// /api/auth/me version, so every consumer (LoginButton, GlobalSearch,
// FeedbackButton) is untouched. isAdmin is computed server-side by the
// customSession plugin (its superadmin branch reads an env var) and arrives via
// useSession().

import { createContext, useContext, useEffect, useState } from 'react';
import { authClient } from '../auth-client';
import { resolveAuthState, type AuthState } from './auth-state';

export type { AuthState };

const AuthContext = createContext<AuthState | null>(null);

/**
 * Publishes auth state to descendants; the provider owns subscription and update lifecycle while
 * children consume it.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [released, setReleased] = useState(false);

  useEffect(() => {
    // Official hydrate two-pass: first paint matches the server hold, then
    // release. Deferred one macrotask so this is not a synchronous setState in
    // the effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => setReleased(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const state = resolveAuthState(released, data ?? null, isPending);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/**
 * Encapsulates the auth subscription and state lifecycle; callers provide lookup keys where
 * required and render the returned state.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
