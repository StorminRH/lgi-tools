'use client';

import { useConvexAuthState } from './convex-auth-store';

export function useConvexAuthed(): boolean {
  return useConvexAuthState().isAuthenticated;
}
