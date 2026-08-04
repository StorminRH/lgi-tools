'use client';

// The sanctioned door from src/** into Convex mutation hooks and optimistic
// paginated helpers. Lives in @/data/convex so the mapper zone never imports
// `convex/react` (or `convex/browser`) directly.
export type { OptimisticLocalStore } from 'convex/browser';
export {
  insertAtBottomIfLoaded,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
  useMutation,
} from 'convex/react';
