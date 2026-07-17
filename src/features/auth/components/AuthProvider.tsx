'use client';

// Client-side identity provider. The root layout doesn't read the session at
// render time (3.0.4.7) — this provider subscribes to Better Auth's session via
// useSession() and shares it through context, so the header and feedback modal
// fill in login state after the static shell paints. `loading` is true until the
// first fetch resolves; consumers render a neutral state during that window
// rather than flashing logged-out.
//
// The AuthState shape (session/isAdmin/loading) is unchanged from the pre-3.4.1
// /api/auth/me version, so every consumer (LoginButton, GlobalSearch,
// FeedbackButton) is untouched. isAdmin is computed server-side by the
// customSession plugin (its superadmin branch reads an env var) and arrives via
// useSession().

import { createContext, useContext } from 'react';
import { authClient } from '../auth-client';
import type { Session } from '../types';

/** Client authentication context with session, loading state, and explicit refresh action. */
export interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Publishes auth state to descendants; the provider owns subscription and update lifecycle while
 * children consume it.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();

  // A real session always carries an active character (one per user in 3.4.1a).
  let session: Session | null = null;
  let isAdmin = false;
  if (data != null && data.characterId != null) {
    session = {
      characterId: data.characterId,
      name: data.name,
      portraitUrl: data.portraitUrl,
      role: data.role,
    };
    isAdmin = data.isAdmin;
  }

  const state: AuthState = { session, isAdmin, loading: isPending };

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
