// Pure EVE SSO helpers. Zero DB imports, zero `next/headers` imports.
// HTTP + JWT verification + claim parsing only.

import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { z } from 'zod';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { EveJwtClaims, EveTokenResponse } from './types';

// Better Auth provider id for EVE SSO. Lives here (the pure, DB-free module) so
// both the auth instance and the query layer can reference it without an import
// cycle.
export const EVE_PROVIDER_ID = 'eve';

export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
export const EVE_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
export const EVE_ISSUER = 'https://login.eveonline.com';
export const EVE_AUDIENCE = 'EVE Online';

// Extending scopes is a config change, not a code change — but every addition
// forces all pilots to re-consent, so 3.4.6 expanded this ONCE to the full
// tracker superset (Decision Record 13) and it should not grow again without
// that same weight of decision. Decision Record 13 listed 12 strings, but
// `esi-skills.read_attributes.v1` no longer exists in the live ESI scope list
// (verified 2026-06-11 against both the current OpenAPI spec and the legacy
// swagger) — /characters/{id}/attributes is gated by read_skills. Requesting a
// nonexistent scope breaks ALL sign-in with `invalid_scope`, so the superset
// is these 11. Killmail scopes are deliberately excluded (operator decision).
export const EVE_SCOPES = [
  'publicData',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-planets.manage_planets.v1',
  'esi-characters.read_standings.v1',
  'esi-clones.read_implants.v1',
  'esi-clones.read_clones.v1',
  'esi-location.read_location.v1',
  'esi-location.read_online.v1',
  'esi-location.read_ship_type.v1',
] as const;

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

// Outcome of a refresh-token grant. Distinguishing the three cases is the whole
// point: `dead` means the refresh token is gone (the pilot must reconnect, so
// the caller nulls custody); `retryable` is a transient upstream/network blip
// (custody is preserved untouched, the caller surfaces a retryable error).
export type RefreshResult =
  | { kind: 'ok'; access_token: string; refresh_token: string; expires_in: number }
  | { kind: 'dead' }
  | { kind: 'retryable' };

// Exchange a stored refresh token for a fresh access token. Pure HTTP — no DB,
// no crypto; persistence + re-encryption live in eve-token-service.ts so this
// stays unit-testable with a `fetch` spy, exactly like exchangeCodeForToken.
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
  } catch {
    // Network error or the fetch-with-timeout abort firing — transient. Never
    // destroy custody on a blip.
    return { kind: 'retryable' };
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
      ? { kind: 'dead' }
      : { kind: 'retryable' };
  }
  if (!res.ok) return { kind: 'retryable' };

  const parsed = eveTokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) return { kind: 'retryable' };

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

// EVE encodes the character ID in the JWT `sub` as "CHARACTER:EVE:<numeric-id>".
// We throw if the shape is unexpected — the caller turns that into a 4xx redirect.
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

export function portraitUrl(characterId: number, size: 32 | 64 | 128 | 256 | 512 = 128): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}
