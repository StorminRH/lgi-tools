'use client';

// Whether Convex has an identity yet, as a slice hook.
//
// Lives here because @/data/convex owns the browser Convex client and its hooks (lint-enforced).
// Consumers import this instead of `convex/react`'s `useConvexAuth` / `<Authenticated>`.
//
// Why any consumer needs it: the Convex websocket connects before Better Auth has minted the JWT, so
// a gated query issued during that window reaches the server with no identity and is rejected. A
// subtree whose queries require an identity must therefore not mount until this is true — the same
// reason `OnlineStatusProvider` wraps its authenticated subscription in `<Authenticated>`.
import { useConvexAuth } from 'convex/react';

/**
 * True once Convex holds a verified identity, so gated queries will authenticate.
 *
 * False both while the token is still being minted and when the viewer is signed out; callers treat
 * those the same way, by not subscribing.
 */
export function useConvexAuthed(): boolean {
  const { isAuthenticated } = useConvexAuth();
  return isAuthenticated;
}
