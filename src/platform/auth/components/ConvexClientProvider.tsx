'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { ConvexProvider, ConvexProviderWithAuth, useConvexAuth } from 'convex/react';
import { convexClient } from '@/data/convex/client';
import { convexAuthStore } from '@/data/convex/convex-auth-store';
import {
  clearCachedConvexAccessToken,
  fetchConvexAccessToken,
} from '../auth-client';
import { useAuth } from './AuthProvider';

function useAuthForConvex() {
  const { session, loading } = useAuth();
  const isAuthenticated = session !== null;

  useEffect(() => {
    if (!loading && !isAuthenticated) clearCachedConvexAccessToken();
  }, [loading, isAuthenticated]);

  const fetchAccessToken = useCallback(
    ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      fetchConvexAccessToken({ forceRefreshToken }),
    [],
  );

  return useMemo(
    () => ({ isLoading: loading, isAuthenticated, fetchAccessToken }),
    [loading, isAuthenticated, fetchAccessToken],
  );
}

function ConvexAuthPublisher() {
  const state = useConvexAuth();
  useLayoutEffect(() => {
    convexAuthStore.set(state);
  }, [state]);
  return null;
}

// Convex keeps its auth state in a context that changes as the session
// resolves, so the app renders beside ConvexProviderWithAuth rather than inside
// it and reads that state from convexAuthStore (see createClientStore). The
// auth provider renders first, so its effect sets the token before the app's
// queries subscribe, as it did when it wrapped them.
export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return (
    <>
      <ConvexProviderWithAuth client={convexClient} useAuth={useAuthForConvex}>
        <ConvexAuthPublisher />
      </ConvexProviderWithAuth>
      <ConvexProvider client={convexClient}>{children}</ConvexProvider>
    </>
  );
}
