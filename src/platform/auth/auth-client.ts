'use client';

// Browser-side Better Auth client. Used by the header (login/logout) and the
// AuthProvider (useSession). baseURL is omitted so the client talks to the same
// origin's /api/auth — correct for local, preview, and production alike.
//
// The `auth` import is TYPE-ONLY (erased at compile time): it gives the client
// the custom-session field types (characterId/name/portraitUrl/role/isAdmin)
// without pulling the server module — and its db/drizzle imports — into the
// client bundle.

import { customSessionClient, genericOAuthClient, jwtClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from './auth';

/**
 * Browser Better Auth client configured with the EVE OAuth provider and shared session contract.
 * `jwtClient` exposes the server `jwt` plugin's mint endpoint as `authClient.token()`, which the
 * Convex bridge calls on every (re)connect — the library owns that wire shape, not a hand-pinned
 * contract.
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), customSessionClient<typeof auth>(), jwtClient()],
});

/**
 * Mints a fresh Convex bridge JWT, returning null when the caller is anonymous or the mint fails.
 * Convex's auth contract wants null rather than a rejection — a thrown network error (DNS,
 * connection reset) would wedge its state machine until reload.
 */
export async function fetchConvexAccessToken(): Promise<string | null> {
  try {
    const { data } = await authClient.token();
    return data?.token ?? null;
  } catch {
    return null;
  }
}
