// Per-character ESI token custody (3.4.1b). Reads an EVE account's stored
// tokens, vends a fresh short-lived access token — refreshing against EVE only
// when the stored one is near expiry — and re-encrypts + persists the rotated
// refresh token. The refresh token is decrypted, used, and re-encrypted entirely
// within this layer; it never appears in a return value, so nothing this feeds
// (the internal endpoint, Convex) can ever hold it.
//
// This is the DB+crypto layer; the raw HTTP refresh lives in eve-sso.ts (pure),
// which keeps that module DB-free and this module's logic mockable.

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { EVE_PROVIDER_ID, EVE_SCOPES, refreshEveToken } from './eve-sso';
import { account } from './schema';
import { decryptToken, encryptToken } from './token-crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Refresh proactively when the stored access token has under a minute of life
// left, so a vended token always carries usable headroom for the caller's call.
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export type FreshTokenResult =
  | { kind: 'ok'; accessToken: string; expiresAt: Date; characterId: number; scopes: string[] }
  | { kind: 'not_found' }
  | { kind: 'reauth_required' }
  | { kind: 'upstream_error' };

function parseScopes(scope: string | null): string[] {
  const trimmed = scope?.trim();
  return trimmed ? trimmed.split(/\s+/) : [...EVE_SCOPES];
}

export async function getFreshAccessTokenForCharacter(
  characterId: number,
): Promise<FreshTokenResult> {
  const [row] = await db
    .select({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      scope: account.scope,
    })
    .from(account)
    .where(
      and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))),
    )
    .limit(1);

  if (!row) return { kind: 'not_found' };

  // A null, legacy-plaintext, or tampered refresh token all decrypt to null —
  // we can't mint anything, so the pilot must reconnect this character.
  const refreshToken = row.refreshToken ? decryptToken(row.refreshToken) : null;
  if (refreshToken === null) return { kind: 'reauth_required' };

  const scopes = parseScopes(row.scope);

  // A still-valid stored access token is handed back without touching EVE.
  if (
    row.accessToken &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    const cached = decryptToken(row.accessToken);
    if (cached !== null) {
      return {
        kind: 'ok',
        accessToken: cached,
        expiresAt: row.accessTokenExpiresAt,
        characterId,
        scopes,
      };
    }
  }

  const result = await refreshEveToken({
    refreshToken,
    clientId: requireEnv('EVE_CLIENT_ID'),
    clientSecret: requireEnv('EVE_CLIENT_SECRET'),
  });

  // Transient upstream/network failure: keep custody intact and let the caller
  // retry. We do NOT touch the row.
  if (result.kind === 'retryable') return { kind: 'upstream_error' };

  // Dead refresh token: drop all token custody so the next vend short-circuits to
  // reauth_required and the alt-management UI (3.4.2) can surface "reconnect".
  // The account row itself stays — only the token columns are nulled.
  if (result.kind === 'dead') {
    await db
      .update(account)
      .set({
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(account.id, row.id));
    return { kind: 'reauth_required' };
  }

  // Success: persist the rotated refresh token + the fresh access token, both
  // re-encrypted. EVE rotates refresh tokens, so we always store the returned one.
  const expiresAt = new Date(Date.now() + result.expires_in * 1000);
  await db
    .update(account)
    .set({
      accessToken: encryptToken(result.access_token),
      refreshToken: encryptToken(result.refresh_token),
      accessTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(account.id, row.id));

  // NOTE (3.4.1b): two concurrent vends for one character could race the rotated
  // refresh token (last write wins, a stale token persisted). Out of scope — the
  // sole caller is Convex at low rate; a conditional update is the eventual fix.
  return { kind: 'ok', accessToken: result.access_token, expiresAt, characterId, scopes };
}
