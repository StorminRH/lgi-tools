import 'server-only';

import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { z } from 'zod';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { characterPortraitUrl, type EveImageSize } from '@/lib/eve-image';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  EVE_AUDIENCE,
  EVE_ISSUER,
  EVE_JWKS_URL,
  EVE_REVOKE_URL,
  EVE_TOKEN_URL,
} from './eve-sso-constants';
import type { EveJwtClaims, EveTokenResponse } from './types';

export {
  EVE_AUTHORIZE_URL,
  EVE_AUTHORIZED_APPS_URL,
  EVE_PROVIDER_ID,
  EVE_REVOKE_URL,
  EVE_SCOPES,
  EVE_TOKEN_URL,
} from './eve-sso-constants';

const eveTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
});

const eveTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

let jwksCache: ReturnType<typeof createRemoteJWKSet> | undefined;
function jwks() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(EVE_JWKS_URL), {
      [customFetch]: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('User-Agent', OUTBOUND_USER_AGENT);
        return fetchWithTimeout(input, { ...init, headers });
      },
    });
  }
  return jwksCache;
}

function buildTokenRequestInit(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): RequestInit {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
      'User-Agent': OUTBOUND_USER_AGENT,
    },
    body: body.toString(),
  };
}

export interface ExchangeCodeInput {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}

export async function exchangeCodeForToken({
  code,
  codeVerifier,
  clientId,
  clientSecret,
}: ExchangeCodeInput): Promise<EveTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
  });

  const res = await fetchWithTimeout(
    EVE_TOKEN_URL,
    buildTokenRequestInit(body, clientId, clientSecret),
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EVE token exchange failed (${res.status}): ${text}`);
  }

  const parsed = eveTokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error('EVE token response failed boundary validation');
  }
  return parsed.data;
}

export interface RefreshTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export type RefreshFailureClass =
  | 'invalid_grant'
  | 'timeout'
  | 'connection'
  | 'provider_5xx'
  | 'unexpected';

export type RefreshResult =
  | { kind: 'ok'; access_token: string; refresh_token: string; expires_in: number }
  | { kind: 'dead'; failureClass: 'invalid_grant' }
  | { kind: 'retryable'; failureClass: Exclude<RefreshFailureClass, 'invalid_grant'> };

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  );
}

export async function refreshEveToken({
  refreshToken,
  clientId,
  clientSecret,
}: RefreshTokenInput): Promise<RefreshResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  let res: Response;
  try {
    res = await fetchWithTimeout(
      EVE_TOKEN_URL,
      buildTokenRequestInit(body, clientId, clientSecret),
    );
  } catch (error) {
    return {
      kind: 'retryable',
      failureClass: isTimeoutError(error) ? 'timeout' : 'connection',
    };
  }

  if (res.status === 400) {
    const errBody = eveTokenErrorSchema.safeParse(await res.json().catch(() => null));
    return errBody.success && errBody.data.error === 'invalid_grant'
      ? { kind: 'dead', failureClass: 'invalid_grant' }
      : { kind: 'retryable', failureClass: 'unexpected' };
  }
  if (res.status >= 500 && res.status <= 599) {
    return { kind: 'retryable', failureClass: 'provider_5xx' };
  }
  if (!res.ok) return { kind: 'retryable', failureClass: 'unexpected' };

  const parsed = eveTokenResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { kind: 'retryable', failureClass: 'unexpected' };

  return {
    kind: 'ok',
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token ?? refreshToken,
    expires_in: parsed.data.expires_in ?? 1200,
  };
}

export interface RevokeTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Revoke a stored refresh token at EVE's SSO revocation endpoint (RFC 7009). Pure
 * HTTP — no DB, no crypto — so it stays unit-testable with a `fetch` spy, like
 * refreshEveToken. BEST-EFFORT by contract: a purge that revokes a pilot's grant
 * must never be aborted by a revoke failure, so this never throws and reports only
 * a boolean. Reuses the shared Basic-auth form request shape (the revoke endpoint
 * authenticates a confidential client exactly like the token endpoint).
 *
 * NOTE: EVE returns 200 for an unknown/already-invalid token too (RFC 7009 §2.2),
 * so `ok` means "the renewal path is closed", NOT "the token existed". Revoking
 * the refresh token immediately stops new access tokens from being minted; any
 * access token already issued self-expires within EVE's ~20 min lifetime.
 */
export async function revokeEveRefreshToken({
  refreshToken,
  clientId,
  clientSecret,
}: RevokeTokenInput): Promise<{ ok: boolean }> {
  const body = new URLSearchParams({
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });

  try {
    const res = await fetchWithTimeout(
      EVE_REVOKE_URL,
      buildTokenRequestInit(body, clientId, clientSecret),
    );
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function verifyEveJwt(accessToken: string): Promise<EveJwtClaims> {
  const { payload } = await jwtVerify(accessToken, jwks(), {
    issuer: EVE_ISSUER,
    audience: EVE_AUDIENCE,
  });
  return payload as unknown as EveJwtClaims;
}

export interface CharacterIdentity {
  characterId: number;
  name: string;
  portraitUrl: string;
}

export function claimsToCharacter(claims: EveJwtClaims): CharacterIdentity {
  const match = /^CHARACTER:EVE:(\d+)$/.exec(claims.sub);
  if (!match) {
    throw new Error(`Unexpected sub format: ${claims.sub}`);
  }
  const characterId = Number(match[1]);
  if (!Number.isFinite(characterId) || characterId <= 0) {
    throw new Error(`Non-positive character id parsed from sub: ${claims.sub}`);
  }
  if (typeof claims.name !== 'string' || claims.name.length === 0) {
    throw new Error('JWT missing `name` claim');
  }
  return {
    characterId,
    name: claims.name,
    portraitUrl: portraitUrl(characterId),
  };
}

export function portraitUrl(characterId: number, size: EveImageSize = 128): string {
  return characterPortraitUrl(characterId, size);
}
