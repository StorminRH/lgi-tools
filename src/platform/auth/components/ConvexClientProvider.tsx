'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { ConvexProviderWithAuth } from 'convex/react';
import { convexClient } from '@/data/convex/client';
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

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
