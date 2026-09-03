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
import type { AppAuth } from './auth';

/**
 * Browser Better Auth client configured with the EVE OAuth provider and shared session contract.
 * `jwtClient` exposes the server `jwt` plugin's mint endpoint as `authClient.token()`, which the
 * Convex bridge calls when it has no usable JWT (first mint, expiry, or forceRefreshToken).
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), customSessionClient<AppAuth>(), jwtClient()],
});

interface CachedConvexJwt {
  token: string;
  expiresAt: number;
}

let cachedConvexJwt: CachedConvexJwt | null = null;

/** Drops a held mint so logout cannot reuse another user's JWT on this tab. */
export function clearCachedConvexAccessToken(): void {
  cachedConvexJwt = null;
}

function jwtExpiresAtMs(token: string): number | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const json = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    return atob(padded);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Convex bridge JWT. Reuses a still-valid mint until `exp` unless Convex asks
 * for a forced refresh. Returns null when the caller is anonymous or the mint
 * fails — Convex's auth contract wants null rather than a rejection.
 */
export async function fetchConvexAccessToken(opts?: {
  forceRefreshToken?: boolean;
}): Promise<string | null> {
  const force = opts?.forceRefreshToken === true;
  if (!force && cachedConvexJwt !== null && Date.now() < cachedConvexJwt.expiresAt) {
    return cachedConvexJwt.token;
  }
  try {
    const { data } = await authClient.token();
    const token = data?.token ?? null;
    if (token === null) {
      cachedConvexJwt = null;
      return null;
    }
    const expiresAt = jwtExpiresAtMs(token);
    cachedConvexJwt = expiresAt === null ? null : { token, expiresAt };
    return token;
  } catch {
    cachedConvexJwt = null;
    return null;
  }
}
