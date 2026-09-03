'use client';

import { customSessionClient, genericOAuthClient, jwtClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from './auth';

export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), customSessionClient<typeof auth>(), jwtClient()],
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
