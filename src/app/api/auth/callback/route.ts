import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  cookieOptions,
} from '@/features/auth/cookies';
import {
  claimsToCharacter,
  exchangeCodeForToken,
  verifyEveJwt,
} from '@/features/auth/eve-sso';
import { upsertCharacterOnLogin } from '@/features/auth/queries';
import { encryptSession } from '@/features/auth/session';
import { logUsageEvent } from '@/data/telemetry/queries';

// EVE SSO callback always supplies non-empty `code` and `state`. A request
// missing either is either a malformed bookmark or a half-finished spoof
// attempt; both deserve the same state_mismatch redirect as a real
// CSRF-style tampered callback.
const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function redirectHome(request: NextRequest, errorCode?: string): Response {
  const url = new URL('/', request.url);
  if (errorCode) url.searchParams.set('auth_error', errorCode);
  return Response.redirect(url, 302);
}

// authz: public
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = callbackQuerySchema.safeParse({
    code: request.nextUrl.searchParams.get('code') ?? '',
    state: request.nextUrl.searchParams.get('state') ?? '',
  });

  const jar = await cookies();
  const stateCookie = jar.get(OAUTH_STATE_COOKIE)?.value;
  const verifierCookie = jar.get(OAUTH_VERIFIER_COOKIE)?.value;

  // Clear the handshake cookies regardless of outcome — they're single-use.
  jar.delete(OAUTH_STATE_COOKIE);
  jar.delete(OAUTH_VERIFIER_COOKIE);

  if (!parsed.success || !stateCookie || !verifierCookie || parsed.data.state !== stateCookie) {
    return redirectHome(request, 'state_mismatch');
  }
  const { code } = parsed.data;

  const clientId = requireEnv('EVE_CLIENT_ID');
  const clientSecret = requireEnv('EVE_CLIENT_SECRET');

  let characterId: number;
  let name: string;
  let portraitUrl: string;
  try {
    const token = await exchangeCodeForToken({
      code,
      codeVerifier: verifierCookie,
      clientId,
      clientSecret,
    });
    const claims = await verifyEveJwt(token.access_token);
    ({ characterId, name, portraitUrl } = claimsToCharacter(claims));
  } catch (err) {
    console.error('[auth/callback] token exchange or JWT verify failed', err);
    return redirectHome(request, 'token_exchange_failed');
  }

  try {
    await upsertCharacterOnLogin({ characterId, name, portraitUrl });
  } catch (err) {
    console.error('[auth/callback] character upsert failed', err);
    return redirectHome(request, 'db_write_failed');
  }

  const jwe = await encryptSession({ characterId });
  jar.set(
    SESSION_COOKIE,
    jwe,
    cookieOptions({ maxAge: SESSION_MAX_AGE_SECONDS }),
  );

  // Best-effort: telemetry never blocks auth completion.
  void logUsageEvent({
    action: 'auth_login',
    characterId,
    metadata: {},
  }).catch((err) => console.error('[auth/callback] telemetry write failed', err));

  return redirectHome(request);
}
