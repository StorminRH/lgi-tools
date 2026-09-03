'use client';

import { useConvexAuth } from 'convex/react';

export function useConvexAuthed(): boolean {
  const { isAuthenticated } = useConvexAuth();
  return isAuthenticated;
}
