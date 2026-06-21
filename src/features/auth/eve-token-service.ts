// Per-character ESI token custody (3.4.1b). Reads an EVE account's stored
// tokens, vends a fresh short-lived access token — refreshing against EVE only
// when the stored one is near expiry — and re-encrypts + persists the rotated
// refresh token. The refresh token is decrypted, used, and re-encrypted entirely
// within this layer; it never appears in a return value, so nothing this feeds
// (the internal endpoint, Convex) can ever hold it.
//
// This is the DB+crypto layer; the raw HTTP refresh lives in eve-sso.ts (pure),
// which keeps that module DB-free and this module's logic mockable.
//
// Concurrency: two sync subjects (skills + industry-jobs) vend the SAME character
// at once, so the write-back is a compare-and-swap keyed on the refresh-token
// ciphertext exactly as read. The DESTRUCTIVE op — the dead-branch NULL — is the
// one that must be guarded (only null the token we actually used); the success
// write also repairs a raced loser's NULL but never clobbers a different token
// (a concurrent rotation winner, or a re-auth written mid-vend). See the two
// writes below.

import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { logUsageEvent } from '@/data/telemetry/queries';
import { requireEnv } from '@/lib/env';
import { EVE_PROVIDER_ID, refreshEveToken } from './eve-sso';
import { account } from './schema';
import { decryptToken, encryptToken } from './token-crypto';

// Refresh proactively when the stored access token has under a minute of life
// left, so a vended token always carries usable headroom for the caller's call.
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export type FreshTokenResult =
  | { kind: 'ok'; accessToken: string; expiresAt: Date; characterId: number; scopes: string[] }
  | { kind: 'not_found' }
  | { kind: 'reauth_required' }
  | { kind: 'upstream_error' };

// Reflect ONLY the scopes actually recorded on the account. A null/empty scope
// means "unknown" — return an empty list rather than assuming the full requested
// set, so a caller can't read unproven grants off the vended response.
function parseScopes(scope: string | null): string[] {
  const trimmed = scope?.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

// The one account read, shared by the top of the vend and the lost-race re-read,
// so both look the row up the same way.
function loadAccountRow(characterId: number) {
  return db
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
    .limit(1)
    .then((rows) => rows[0]);
}

// A conditional write affected 0 rows: a concurrent vend rotated this account's
// refresh token (or a re-auth replaced it) between our read and our write. Don't
// clobber the winner and don't null a possibly-valid account — re-read and hand
// back whatever is now stored: the winner's freshly-persisted access token, or
// reauth_required if the row is genuinely tokenless.
async function reflectStoredToken(characterId: number): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };
  if (row.refreshToken === null || !row.accessToken || !row.accessTokenExpiresAt) {
    return { kind: 'reauth_required' };
  }
  const access = decryptToken(row.accessToken);
  if (access === null) return { kind: 'reauth_required' };
  return {
    kind: 'ok',
    accessToken: access,
    expiresAt: row.accessTokenExpiresAt,
    characterId,
    scopes: parseScopes(row.scope),
  };
}

export async function getFreshAccessTokenForCharacter(
  characterId: number,
): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };

  // CAS key: the encrypted bytes EXACTLY AS READ. Both conditional writes below
  // compare this verbatim — NEVER encryptToken(...), which mints a fresh IV every
  // call and would never match. Do not "tidy" this into a re-encrypt.
  const refreshCiphertext = row.refreshToken;

  // A null, legacy-plaintext, or tampered refresh token all decrypt to null —
  // we can't mint anything, so the pilot must reconnect this character.
  const refreshToken = refreshCiphertext ? decryptToken(refreshCiphertext) : null;
  if (refreshToken === null || refreshCiphertext === null) return { kind: 'reauth_required' };

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

  // Dead refresh token: drop custody so the next vend short-circuits to
  // reauth_required and the alt-management UI can surface "reconnect" — but ONLY
  // if the stored refresh token is STILL the one we just used. Conditional on the
  // ciphertext as read: 0 rows means a concurrent vend already rotated it, so the
  // token we got invalid_grant on is stale, the account is fine, and nulling would
  // force a needless reauth. That 0-row case is the smoking-gun signal that EVE
  // has begun invalidating rotated refresh tokens.
  if (result.kind === 'dead') {
    const nulled = await db
      .update(account)
      .set({
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(account.id, row.id), eq(account.refreshToken, refreshCiphertext)))
      .returning({ id: account.id });

    if (nulled.length === 0) {
      void logUsageEvent({
        action: 'eve_token_refresh_race',
        characterId,
        metadata: { signal: 'concurrent_invalid_grant' },
      }).catch((err) => console.error('[eve-token] telemetry write failed', err));
      return reflectStoredToken(characterId);
    }
    return { kind: 'reauth_required' };
  }

  // Success: persist the rotated refresh token + the fresh access token, both
  // re-encrypted. EVE rotates refresh tokens, so we always store the returned one.
  // Conditional so a concurrent winner is never clobbered — but the `IS NULL` arm
  // REPAIRS a row a raced loser nulled (its dead-branch NULL landed before this
  // write), so custody self-heals rather than being lost. 0 rows means the slot
  // already holds a DIFFERENT token (a rotation winner, or a re-auth written
  // mid-vend); don't overwrite it — reflect what's stored.
  const expiresAt = new Date(Date.now() + result.expires_in * 1000);
  const written = await db
    .update(account)
    .set({
      accessToken: encryptToken(result.access_token),
      refreshToken: encryptToken(result.refresh_token),
      accessTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(account.id, row.id),
        or(eq(account.refreshToken, refreshCiphertext), isNull(account.refreshToken)),
      ),
    )
    .returning({ id: account.id });

  if (written.length === 0) return reflectStoredToken(characterId);

  return { kind: 'ok', accessToken: result.access_token, expiresAt, characterId, scopes };
}
