// Pure EVE SSO helpers. Zero DB imports, zero `next/headers` imports.
// HTTP + JWT verification + claim parsing only.

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

// Boundary schema for the token-exchange envelope. The JWT *claims* are
// cryptographically verified by jose; this wrapping envelope is not, so it
// gets a boundary check. `access_token` is the only field we consume — it is
// required and non-empty; the rest are present-but-lenient so a discarded
// field changing shape can't fail an otherwise-valid login.
const eveTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
});

// EVE returns an OAuth2 error envelope on a 400 — `{ error, error_description? }`.
// We read it to tell a genuinely-dead token (`invalid_grant`) from a transient or
// our-side 400, so only the former drops a pilot's custody.
const eveTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

// EVE's JWKS rotates rarely; `jose` caches the remote set per process.
// jose v6 has no `timeoutDuration` option and the bare `{ headers }` arg is
// legacy — the `[customFetch]` symbol is the supported extensibility hook, so
// the timeout and the outbound identity header live together at this one site.
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

// Shared request shape for both EVE token grants. EVE's token endpoint needs
// HTTP Basic auth, the form content type, the Host header, AND a descriptive
// User-Agent (CCP blocks UA-less traffic) — the authorization_code exchange and
// the refresh_token grant differ only in the body, so they share this.
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

interface ExchangeCodeInput {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Exchanges one EVE OAuth authorization code using PKCE and returns the validated token response;
 * provider failures remain explicit.
 */
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

  // Validate the envelope at the boundary. A malformed body throws here the
  // same way an HTTP error does above; the callback turns that into a
  // token_exchange_failed auth-error redirect.
  const parsed = eveTokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error('EVE token response failed boundary validation');
  }
  return parsed.data;
}

interface RefreshTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Outcome of a refresh-token grant. Distinguishing the three cases is the whole
 * point: `dead` means the refresh token is gone (the pilot must reconnect, so
 * the caller nulls custody); `retryable` means the response did not prove the
 * token dead, so custody is preserved and the caller surfaces a retryable error.
 */
export type RefreshFailureClass =
  | 'invalid_grant'
  | 'timeout'
  | 'connection'
  | 'provider_5xx'
  | 'unexpected';

/**
 * EVE OAuth refresh verdict, preserving rotated credentials on success and classifying terminal
 * versus retryable failures.
 */
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

/**
 * Exchange a stored refresh token for a fresh access token. Pure HTTP — no DB,
 * no crypto; persistence + re-encryption live in eve-token-service.ts so this
 * stays unit-testable with a `fetch` spy, exactly like exchangeCodeForToken.
 */
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
    // Network error or the fetch-with-timeout abort firing — transient. Never
    // destroy custody on a blip.
    return {
      kind: 'retryable',
      failureClass: isTimeoutError(error) ? 'timeout' : 'connection',
    };
  }

  // A 400 carries an OAuth error body. ONLY `invalid_grant` means the refresh
  // token is genuinely dead (revoked / expired / already rotated away) and the
  // pilot must re-authenticate. Any other 400 (e.g. `invalid_request`) — and a
  // missing or non-JSON body — is treated as transient: never destroy custody on
  // an ambiguous or our-side error. Any other non-2xx (5xx, rate limiting) is
  // likewise transient.
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
    // EVE rotates the refresh token and always returns one on this grant, but the
    // envelope marks it optional — fall back to the submitted token so a response
    // quirk can never drop custody. Likewise default the lifetime to EVE's 20 min.
    refresh_token: parsed.data.refresh_token ?? refreshToken,
    expires_in: parsed.data.expires_in ?? 1200,
  };
}

interface RevokeTokenInput {
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
  // RFC 7009 revoke params: the token + its type hint. NOT the token endpoint's
  // `grant_type`/`refresh_token` keys — the revoke endpoint takes `token`.
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
    // Network error or the fetch-with-timeout abort firing — best-effort, swallow.
    return { ok: false };
  }
}

/**
 * Verifies an EVE access token's signature, issuer, audience, expiry, and subject against the
 * provider JWKS.
 */
export async function verifyEveJwt(accessToken: string): Promise<EveJwtClaims> {
  const { payload } = await jwtVerify(accessToken, jwks(), {
    issuer: EVE_ISSUER,
    audience: EVE_AUDIENCE,
  });
  return payload as unknown as EveJwtClaims;
}

interface CharacterIdentity {
  characterId: number;
  name: string;
  portraitUrl: string;
}

/**
 * EVE encodes the character ID in the JWT `sub` as "CHARACTER:EVE:<numeric-id>".
 * We throw if the shape is unexpected — the caller turns that into a 4xx redirect.
 */
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

/** Builds the canonical EVE character portrait URL for the requested character ID and supported pixel size. */
export function portraitUrl(characterId: number, size: EveImageSize = 128): string {
  return characterPortraitUrl(characterId, size);
}
