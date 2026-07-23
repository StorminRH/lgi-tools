'use client';

// Browser-side Better Auth client. Used by the header (login/logout) and the
// AuthProvider (useSession). baseURL is omitted so the client talks to the same
// origin's /api/auth — correct for local, preview, and production alike.
//
// The `auth` import is TYPE-ONLY (erased at compile time): it gives the client
// the custom-session field types (characterId/name/portraitUrl/role/isAdmin)
// without pulling the server module — and its db/drizzle imports — into the
// client bundle.

import { customSessionClient, genericOAuthClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from './auth';

/** Browser Better Auth client configured with the EVE OAuth provider and shared session contract. */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), customSessionClient<typeof auth>()],
});
