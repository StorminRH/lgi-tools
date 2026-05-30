import { connection, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  OAUTH_HANDSHAKE_MAX_AGE_SECONDS,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  cookieOptions,
} from '@/features/auth/cookies';
import { buildAuthorizeUrl } from '@/features/auth/eve-sso';
import {
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateState,
} from '@/features/auth/pkce';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// No user input — handshake initiator, all PKCE state generated server-side.
export async function GET(_request: NextRequest): Promise<Response> {
  // Handshake initiator: must run per-request (fresh PKCE state + cookie writes).
  // Cache Components prerenders GET handlers by default, so defer to request time
  // before any env or crypto access.
  await connection();
  const clientId = requireEnv('EVE_CLIENT_ID');
  const callbackUrl = requireEnv('EVE_CALLBACK_URL');

  const verifier = generateCodeVerifier();
  const state = generateState();
  const challenge = await codeChallengeFromVerifier(verifier);

  const jar = await cookies();
  const opts = cookieOptions({
    maxAge: OAUTH_HANDSHAKE_MAX_AGE_SECONDS,
    path: '/api/auth',
  });
  jar.set(OAUTH_VERIFIER_COOKIE, verifier, opts);
  jar.set(OAUTH_STATE_COOKIE, state, opts);

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    callbackUrl,
    state,
    codeChallenge: challenge,
  });

  return Response.redirect(authorizeUrl, 302);
}
