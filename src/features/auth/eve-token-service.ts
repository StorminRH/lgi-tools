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
import { emitDomainEvent } from '@/data/domain-events/queries';
import { db } from '@/db';
import { logUsageEvent } from '@/data/telemetry/queries';
import type { UsageAction } from '@/data/telemetry/types';
import { requireEnv } from '@/lib/env';
import {
  EVE_PROVIDER_ID,
  refreshEveToken,
  revokeEveRefreshToken,
  type RefreshFailureClass,
} from './eve-sso';
import { account } from './schema';
import { decryptToken, encryptToken } from './token-crypto';

/**
 * Refresh proactively when the stored access token has under a minute of life
 * left, so a vended token always carries usable headroom for the caller's call.
 */
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
/**
 * Duration in milliseconds for invalid grant confirmation grace; callers share this policy value
 * instead of inventing another window.
 */
export const INVALID_GRANT_CONFIRMATION_GRACE_MS = 5 * 60 * 1000;

const TOKEN_REFRESH_FAILURE_ACTIONS = {
  invalid_grant: 'eve_token_refresh_invalid_grant',
  timeout: 'eve_token_refresh_timeout',
  connection: 'eve_token_refresh_connection',
  provider_5xx: 'eve_token_refresh_provider_5xx',
  unexpected: 'eve_token_refresh_unexpected',
} as const satisfies Record<RefreshFailureClass, UsageAction>;

/**
 * Token-vending verdict: a usable access token, a confirmed reauthentication requirement, or a
 * retryable upstream failure.
 */
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

function logTokenRefreshFailure(characterId: number, failureClass: RefreshFailureClass): void {
  void logUsageEvent({
    action: TOKEN_REFRESH_FAILURE_ACTIONS[failureClass],
    characterId,
    metadata: { failureClass },
  }).catch((err) => console.error('[eve-token] telemetry write failed', err));
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
      refreshTokenInvalidGrantCount: account.refreshTokenInvalidGrantCount,
      refreshTokenInvalidGrantFirstAt: account.refreshTokenInvalidGrantFirstAt,
      scope: account.scope,
    })
    .from(account)
    .where(
      and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))),
    )
    .limit(1)
    .then((rows) => rows[0]);
}

type LoadedAccountRow = NonNullable<Awaited<ReturnType<typeof loadAccountRow>>>;

function hasActiveInvalidGrantGrace(row: LoadedAccountRow): boolean {
  const firstAt = row.refreshTokenInvalidGrantFirstAt;
  return (
    row.refreshTokenInvalidGrantCount === 1 &&
    firstAt !== null &&
    Date.now() - firstAt.getTime() < INVALID_GRANT_CONFIRMATION_GRACE_MS
  );
}

function readCachedToken(
  row: LoadedAccountRow,
  characterId: number,
  scopes: string[],
): FreshTokenResult | null {
  if (
    row.refreshTokenInvalidGrantCount === 1 ||
    !row.accessToken ||
    !row.accessTokenExpiresAt ||
    row.accessTokenExpiresAt.getTime() - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    return null;
  }
  const accessToken = decryptToken(row.accessToken);
  return accessToken === null
    ? null
    : { kind: 'ok', accessToken, expiresAt: row.accessTokenExpiresAt, characterId, scopes };
}

// A conditional write affected 0 rows: a concurrent vend rotated this account's
// refresh token (or a re-auth replaced it) between our read and our write. Don't
// clobber the winner and don't null a possibly-valid account — re-read and hand
// back whatever is now stored: the winner's freshly-persisted access token, or
// reauth_required if the row is genuinely tokenless.
async function reflectStoredToken(characterId: number): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };
  if (row.refreshToken === null) return { kind: 'reauth_required' };
  if (row.refreshTokenInvalidGrantCount === 1) return { kind: 'upstream_error' };
  if (!row.accessToken || !row.accessTokenExpiresAt) {
    return { kind: 'reauth_required' };
  }
  const access = decryptToken(row.accessToken);
  if (access === null) return { kind: 'reauth_required' };
  // Mirror the main-path skew guard: a concurrent winner normally just wrote a
  // ~20 min token, but never hand back one inside the refresh skew (clock skew /
  // pathological delay) — the caller re-syncs next cadence rather than carrying a
  // token ESI would reject.
  if (row.accessTokenExpiresAt.getTime() - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS) {
    return { kind: 'reauth_required' };
  }
  return {
    kind: 'ok',
    accessToken: access,
    expiresAt: row.accessTokenExpiresAt,
    characterId,
    scopes: parseScopes(row.scope),
  };
}

async function recordInvalidGrant(
  row: LoadedAccountRow,
  characterId: number,
  refreshCiphertext: string,
): Promise<FreshTokenResult> {
  const confirming = row.refreshTokenInvalidGrantCount === 1;
  const invalidGrantAt = new Date();
  const recorded = await db
    .update(account)
    .set(
      confirming
        ? {
            accessToken: null,
            refreshToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            refreshTokenInvalidGrantCount: 2,
            updatedAt: invalidGrantAt,
          }
        : {
            refreshTokenInvalidGrantCount: 1,
            refreshTokenInvalidGrantFirstAt: invalidGrantAt,
            updatedAt: invalidGrantAt,
          },
    )
    .where(
      and(
        eq(account.id, row.id),
        eq(account.refreshToken, refreshCiphertext),
        eq(account.refreshTokenInvalidGrantCount, confirming ? 1 : 0),
      ),
    )
    .returning({ id: account.id });

  if (recorded.length > 0) {
    emitDomainEvent({
      eventType: 'eve_token_state_changed',
      metadata: {
        characterId,
        from: confirming ? 'suspect' : 'usable',
        to: confirming ? 'reauth_required' : 'suspect',
        reason: 'invalid_grant',
      },
    });
    return confirming ? { kind: 'reauth_required' } : { kind: 'upstream_error' };
  }
  void logUsageEvent({
    action: 'eve_token_refresh_race',
    characterId,
    metadata: { signal: 'concurrent_invalid_grant' },
  }).catch((err) => console.error('[eve-token] telemetry write failed', err));
  return reflectStoredToken(characterId);
}

async function deferInvalidGrantConfirmation(
  row: LoadedAccountRow,
  characterId: number,
  refreshCiphertext: string,
): Promise<FreshTokenResult> {
  const deferredAt = new Date();
  const deferred = await db
    .update(account)
    .set({
      refreshTokenInvalidGrantFirstAt: deferredAt,
      updatedAt: deferredAt,
    })
    .where(
      and(
        eq(account.id, row.id),
        eq(account.refreshToken, refreshCiphertext),
        eq(account.refreshTokenInvalidGrantCount, 1),
      ),
    )
    .returning({ id: account.id });

  return deferred.length > 0 ? { kind: 'upstream_error' } : reflectStoredToken(characterId);
}

/**
 * Revoke a character's EVE grant at CCP (RFC 7009), BEST-EFFORT. Reads the stored
 * refresh-token ciphertext, decrypts it, and revokes it at EVE's SSO endpoint so
 * the renewal path is closed upstream — not just dropped from local custody. NEVER
 * throws: a purge that calls this must finish its Neon teardown even if the revoke
 * fails (CCP down, network blip, env missing, already-dead token). A null/legacy/
 * tampered ciphertext means there is nothing valid to revoke, so we skip silently.
 *
 * Ordering: a purge calls this BEFORE its credential tier deletes the account row
 * (which carries the encrypted token) — the plaintext is needed to revoke. The
 * vend path's CAS race does not apply here: we revoke whatever ciphertext is stored
 * at read time; a concurrent rotation at worst revokes a now-stale token, which CCP
 * treats as a harmless no-op (200 either way).
 */
export async function revokeCharacterToken(characterId: number): Promise<void> {
  try {
    const row = await loadAccountRow(characterId);
    const refreshToken = row?.refreshToken ? decryptToken(row.refreshToken) : null;
    if (refreshToken === null) return; // null/legacy/tampered → nothing valid to revoke
    await revokeEveRefreshToken({
      refreshToken,
      clientId: requireEnv('EVE_CLIENT_ID'),
      clientSecret: requireEnv('EVE_CLIENT_SECRET'),
    });
  } catch (err) {
    // Best-effort: swallow EVERY failure so the caller's purge completes. The
    // grant's local custody is deleted by the purge's credential tier regardless.
    console.error('[eve-token] revoke failed', err);
  }
}

/**
 * Returns a usable access token for one user-owned character, refreshing encrypted custody under
 * the invalid-grant confirmation policy when required.
 */
export async function getFreshAccessTokenForCharacter(
  characterId: number,
): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };

  // CAS key: the encrypted bytes EXACTLY AS READ. Conditional writes below
  // compare this verbatim — NEVER encryptToken(...), which mints a fresh IV every
  // call and would never match. Do not "tidy" this into a re-encrypt.
  const refreshCiphertext = row.refreshToken;

  if (refreshCiphertext === null) return { kind: 'reauth_required' };

  // A first invalid_grant starts a quiet period before the one confirmation
  // attempt. Suppression happens before cached-token handling so every vend in
  // the window reflects the strike consistently and never calls EVE or emits a
  // fabricated provider-failure event.
  if (hasActiveInvalidGrantGrace(row)) return { kind: 'upstream_error' };

  // A legacy-plaintext or tampered refresh token decrypts to null — we can't
  // mint anything, so the pilot must reconnect this character.
  const refreshToken = decryptToken(refreshCiphertext);
  if (refreshToken === null) return { kind: 'reauth_required' };

  const scopes = parseScopes(row.scope);

  // A still-valid stored access token is handed back without touching EVE.
  const cached = readCachedToken(row, characterId, scopes);
  if (cached !== null) return cached;

  const result = await refreshEveToken({
    refreshToken,
    clientId: requireEnv('EVE_CLIENT_ID'),
    clientSecret: requireEnv('EVE_CLIENT_SECRET'),
  });

  if (result.kind !== 'ok') logTokenRefreshFailure(characterId, result.failureClass);

  // Any failure that did not prove the refresh token dead keeps custody intact.
  // If this was the post-grace confirmation attempt, re-arm the quiet period so
  // an outage cannot make every subsequent vend call EVE immediately. The CAS
  // still yields to a concurrent successful refresh or OAuth relink.
  if (result.kind === 'retryable') {
    return row.refreshTokenInvalidGrantCount === 1
      ? deferInvalidGrantConfirmation(row, characterId, refreshCiphertext)
      : { kind: 'upstream_error' };
  }

  // A first invalid_grant records a strike while preserving custody. Only a
  // second invalid_grant after the quiet period clears the tokens. Both writes
  // are conditional on the exact ciphertext AND the strike state we read, so two
  // simultaneous failures cannot advance the state twice and a concurrent
  // rotation/re-auth always wins.
  if (result.kind === 'dead') return recordInvalidGrant(row, characterId, refreshCiphertext);

  // Success: persist the rotated refresh token + the fresh access token, both
  // re-encrypted. EVE rotates refresh tokens, so we always store the returned one.
  // Conditional so a concurrent winner is never clobbered — but the `IS NULL` arm
  // REPAIRS a row a confirming loser nulled before this write, so custody
  // self-heals rather than being lost. 0 rows means the slot
  // already holds a DIFFERENT token (a rotation winner, or a re-auth written
  // mid-vend); don't overwrite it — reflect what's stored.
  const expiresAt = new Date(Date.now() + result.expires_in * 1000);
  const written = await db
    .update(account)
    .set({
      accessToken: encryptToken(result.access_token),
      refreshToken: encryptToken(result.refresh_token),
      accessTokenExpiresAt: expiresAt,
      refreshTokenInvalidGrantCount: 0,
      refreshTokenInvalidGrantFirstAt: null,
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

  if (row.refreshTokenInvalidGrantCount === 1) {
    emitDomainEvent({
      eventType: 'eve_token_state_changed',
      metadata: {
        characterId,
        from: 'suspect',
        to: 'usable',
        reason: 'refresh_recovered',
      },
    });
  }

  return { kind: 'ok', accessToken: result.access_token, expiresAt, characterId, scopes };
}
