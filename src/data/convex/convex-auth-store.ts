import { createClientStore, useClientStore } from '@/lib/client-store';

export interface ConvexAuthState {
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly isRefreshing: boolean;
}

// Published from Convex's own auth context by ConvexClientProvider. The app
// reads it here because that context changes as the session resolves.
export const convexAuthStore = createClientStore<ConvexAuthState>({
  isLoading: true,
  isAuthenticated: false,
  isRefreshing: false,
});

export function useConvexAuthState(): ConvexAuthState {
  return useClientStore(convexAuthStore);
}
