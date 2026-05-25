// Single source of truth for auth cookie names + option shapes.
// Importing this from anywhere else means nobody else hardcodes the strings.

import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export const SESSION_COOKIE = 'lgi_session';
export const OAUTH_STATE_COOKIE = 'lgi_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'lgi_oauth_verifier';

// 7 days for the session, 10 minutes for the in-flight OAuth handshake.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const OAUTH_HANDSHAKE_MAX_AGE_SECONDS = 60 * 10;

interface CookieOptionsInput {
  maxAge: number;
  path?: string;
}

export function cookieOptions({
  maxAge,
  path = '/',
}: CookieOptionsInput): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path,
    maxAge,
  };
}
