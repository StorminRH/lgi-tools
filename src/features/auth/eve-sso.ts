// Pure EVE SSO helpers. Zero DB imports, zero `next/headers` imports.
// HTTP + JWT verification + claim parsing only.

import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { z } from 'zod';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { characterPortraitUrl, type EveImageSize } from '@/lib/eve-image';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { EveJwtClaims, EveTokenResponse } from './types';

// Better Auth provider id for EVE SSO. Lives here (the pure, DB-free module) so
// both the auth instance and the query layer can reference it without an import
// cycle.
export const EVE_PROVIDER_ID = 'eve';

export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
// CCP's published OAuth2 token-revocation endpoint (RFC 7009) — the per-token
// server-side revoke used when a pilot purges a character/account. Distinct from
// EVE_AUTHORIZED_APPS_URL above: that is the pilot's account-level dashboard page;
// this is the granular, per-refresh-token machine endpoint. Hardcoded like the
// other EVE_* URLs (CCP advertises it under `.well-known/oauth-authorization-server`).
export const EVE_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
export const EVE_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
export const EVE_ISSUER = 'https://login.eveonline.com';
export const EVE_AUDIENCE = 'EVE Online';

// EVE's account-level dashboard where a pilot reviews and revokes third-party
// app access. One URL serves every character (CCP scopes it to the logged-in
// pilot), so it's page-level, not per-character. Shared from this one module so
// the /characters revoke link and the Privacy page (/legal) can't drift. The
// legacy community.eveonline.com path is dead (301s to the developers root).
export const EVE_AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';

// The exact scope set the site requests, and the only set a sign-in or relink
// re-consents to (Better Auth's genericOAuth forwards these on both the
// authorize request and the token exchange — see the `getToken` site in
// auth.ts). It is the SUPERSET: each scoped feature declares its own narrower
// subset in its slice and is degraded per-feature, never globally (the
// per-feature deriveScopeHealth in scope-health.ts).
//
// STRICT LEAST-PRIVILEGE (Decision Record, 3.7.1.1): exactly the scopes a
// shipped feature actually consumes — publicData, the two skill reads, the
// character-jobs read, and (added 3.7.3.1, the first corp feature) the corp
// roles read and the corp industry-jobs read. ZERO write scope (no
// `manage_*`/`write_*`). The 3.4.6 superset's seven extra reads (manage_planets,
// standings, two clones, three location) only ever proved an ESI sandbox; they
// were never wired to a feature and are dropped — the dev/esi explorer is
// re-scoped to the consumed set, not kept as a reason to retain them.
//
// Two rules this set is held to (the eve-sso.test.ts pin enforces both):
//  - Every string must EXIST in the live ESI scope list — a nonexistent scope
//    breaks ALL sign-in with `invalid_scope` (a wrong name shipped in 3.4.1a and
//    did exactly that). Removing from a known-good set is safe; ADDING is a
//    deliberate, batched decision (verify the name live first).
//  - No write scope. Read-only by construction.
export const EVE_SCOPES = [
  'publicData',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_jobs.v1',
  // Corp industry jobs (3.7.3.1, the first corp feature). The roles read gates
  // which linked character can vend the corp read; the corp-jobs read also
  // needs the in-game Factory_Manager role (a 403 otherwise — surfaced as a
  // 'needs_role' state in the sync layer, never a scope prompt). Both read-only.
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
  // Owned blueprints (3.7.5.1) — the ME/TE/runs source for the efficiency
  // engine. The character read needs no role; the corp read reuses the corp
  // roles read above and additionally needs the in-game Director role (a 403
  // otherwise — the same 'needs_role' sync state, never a scope prompt). Both
  // read-only.
  'esi-characters.read_blueprints.v1',
  'esi-corporations.read_blueprints.v1',
  // Owned assets (3.7.7.1) — the owned-quantity + held-by source for the build
  // planner's asset ledger. The character read needs no role; the corp read
  // reuses the corp roles read above and additionally needs the in-game
  // Director role (a 403 otherwise — the same 'needs_role' sync state, never a
  // scope prompt). Both read-only. Naming trap: BOTH asset reads live under
  // `esi-assets` (the corp one is `read_corporation_assets`, NOT under
  // `esi-corporations` like the corp blueprints read above).
  'esi-assets.read_assets.v1',
  'esi-assets.read_corporation_assets.v1',
  // Online status (MIGRATE.A) — the live online-status canary on the Convex
  // engine, the placement migration's keeper consumer. Per-character, ~60s ESI
  // cache; drives the live online/offline dot on character portraits. Read-only,
  // needs no in-game role. Re-admitted here after being pruned in 3.7.1.1 — a
  // deliberate, batched re-add (name verified live: esi-location.read_online.v1).
  'esi-location.read_online.v1',
  // Corp owned structures (3.7.9) — the per-corp catalogue of owned Upwell
  // structures the planner offers as build locations. The roles read above gates
  // which linked character may vend the corp read; the structures endpoint also
  // needs the in-game Station_Manager role (a 403 otherwise — the same graceful
  // skip the corp sync layer uses, never a scope prompt). Read-only. Naming trap:
  // this corp list lives under `esi-corporations` (like the corp BLUEPRINTS read),
  // NOT under `esi-universe` — that family's read_structures resolves a single
  // structure's name and is a separate, later decision.
  'esi-corporations.read_structures.v1',
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

interface RevokeTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

// Revoke a stored refresh token at EVE's SSO revocation endpoint (RFC 7009). Pure
// HTTP — no DB, no crypto — so it stays unit-testable with a `fetch` spy, like
// refreshEveToken. BEST-EFFORT by contract: a purge that revokes a pilot's grant
// must never be aborted by a revoke failure, so this never throws and reports only
// a boolean. Reuses the shared Basic-auth form request shape (the revoke endpoint
// authenticates a confidential client exactly like the token endpoint).
//
// NOTE: EVE returns 200 for an unknown/already-invalid token too (RFC 7009 §2.2),
// so `ok` means "the renewal path is closed", NOT "the token existed". Revoking
// the refresh token immediately stops new access tokens from being minted; any
// access token already issued self-expires within EVE's ~20 min lifetime.
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

export function portraitUrl(characterId: number, size: EveImageSize = 128): string {
  return characterPortraitUrl(characterId, size);
}
