'use client';

// Bridges the existing Better Auth client state into Convex (3.4.3). Convex
// wants a useAuth hook returning {isLoading, isAuthenticated, fetchAccessToken};
// we derive the first two from AuthProvider's context and mint the ES256 JWT
// from the spine's /api/auth/token on demand (Convex re-calls fetchAccessToken
// whenever it needs a fresh one, so no client-side caching — every GET mints).
// Must be mounted INSIDE <AuthProvider>.
//
// The returned object is memoized on PRIMITIVES (loading, session !== null):
// AuthProvider rebuilds its context value every render, and an identity-
// unstable useAuth result would bounce Convex back into the loading state.

import { useCallback, useMemo } from 'react';
import { ConvexProviderWithAuth } from 'convex/react';
import { convexClient } from '@/data/convex/client';
import { apiFetch } from '@/lib/api-client';
import { tokenEndpoint } from '../api-contract';
import { useAuth } from './AuthProvider';

function useAuthForConvex() {
  const { session, loading } = useAuth();
  const isAuthenticated = session !== null;

  const fetchAccessToken = useCallback(async () => {
    const result = await apiFetch(tokenEndpoint);
    return result.ok ? result.data.token : null;
  }, []);

  return useMemo(
    () => ({ isLoading: loading, isAuthenticated, fetchAccessToken }),
    [loading, isAuthenticated, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  // No Convex deployment configured (NEXT_PUBLIC_CONVEX_URL unset) — run the
  // site without the provider; consumers null-check the client themselves.
  if (convexClient === null) return <>{children}</>;
  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
