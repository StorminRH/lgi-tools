// Pure EVE SSO helpers. Zero DB imports, zero `next/headers` imports.
// HTTP + JWT verification + claim parsing only.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { EveJwtClaims, EveTokenResponse } from './types';

export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
export const EVE_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
export const EVE_ISSUER = 'login.eveonline.com';
export const EVE_AUDIENCE = 'EVE Online';

// Extending scopes is a config change, not a code change.
export const EVE_SCOPES = ['publicData'] as const;

// EVE's JWKS rotates rarely; `jose` caches the remote set per process.
let jwksCache: ReturnType<typeof createRemoteJWKSet> | undefined;
function jwks() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(EVE_JWKS_URL));
  }
  return jwksCache;
}

interface BuildAuthorizeUrlInput {
  clientId: string;
  callbackUrl: string;
  state: string;
  codeChallenge: string;
}

export function buildAuthorizeUrl({
  clientId,
  callbackUrl,
  state,
  codeChallenge,
}: BuildAuthorizeUrlInput): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: EVE_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${EVE_AUTHORIZE_URL}?${params.toString()}`;
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

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(EVE_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EVE token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as EveTokenResponse;
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
