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
import { account } from '@/db/auth-schema';
import { authorizationRetryAt, successfulAuthorization } from './authorization-policy';
import { decryptToken, encryptToken } from './token-crypto';

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
export const INVALID_GRANT_CONFIRMATION_GRACE_MS = 5 * 60 * 1000;

const TOKEN_REFRESH_FAILURE_ACTIONS = {
  invalid_grant: 'eve_token_refresh_invalid_grant',
  timeout: 'eve_token_refresh_timeout',
  connection: 'eve_token_refresh_connection',
  provider_5xx: 'eve_token_refresh_provider_5xx',
  unexpected: 'eve_token_refresh_unexpected',
} as const satisfies Record<RefreshFailureClass, UsageAction>;

export type FreshTokenResult =
  | { kind: 'ok'; accessToken: string; expiresAt: number }
  | { kind: 'not_found' }
  | { kind: 'reauth_required' }
  | { kind: 'upstream_error' };

function logTokenRefreshFailure(characterId: number, failureClass: RefreshFailureClass): void {
  void logUsageEvent({
    action: TOKEN_REFRESH_FAILURE_ACTIONS[failureClass],
    characterId,
    metadata: { failureClass },
  }).catch((err) => console.error('[eve-token] telemetry write failed', err));
}

function loadAccountRow(characterId: number) {
  return db
    .select({
      id: account.id,
      authorizationFailureFirstAt: account.authorizationFailureFirstAt,
      authorizationFailureCount: account.authorizationFailureCount,
      authorizationNextCheckAt: account.authorizationNextCheckAt,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      refreshTokenInvalidGrantCount: account.refreshTokenInvalidGrantCount,
      refreshTokenInvalidGrantFirstAt: account.refreshTokenInvalidGrantFirstAt,
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

function readCachedToken(row: LoadedAccountRow): FreshTokenResult | null {
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
    : { kind: 'ok', accessToken, expiresAt: row.accessTokenExpiresAt.getTime() };
}

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
  if (row.accessTokenExpiresAt.getTime() - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS) {
    return { kind: 'reauth_required' };
  }
  return { kind: 'ok', accessToken: access, expiresAt: row.accessTokenExpiresAt.getTime() };
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
            authorizationAccessChangedAt: invalidGrantAt,
            accessToken: null,
            refreshToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            refreshTokenInvalidGrantCount: 2,
            updatedAt: invalidGrantAt,
          }
        : {
            authorizationNextCheckAt: new Date(invalidGrantAt.getTime() + INVALID_GRANT_CONFIRMATION_GRACE_MS),
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

async function recordRetryableFailure(
  row: LoadedAccountRow,
  refreshCiphertext: string,
  retryAfterMs = 0,
): Promise<FreshTokenResult> {
  const now = new Date();
  await db.update(account).set({
    authorizationFailureFirstAt: row.authorizationFailureFirstAt ?? now,
    authorizationFailureCount: (row.authorizationFailureCount ?? 0) + 1,
    authorizationNextCheckAt: authorizationRetryAt(row.authorizationFailureCount ?? 0, now.getTime(), retryAfterMs),
    // Durable signal: the worker republishes claims, including timeout suspension.
    authorizationAccessChangedAt: now,
    ...(row.refreshTokenInvalidGrantCount === 1 ? { refreshTokenInvalidGrantFirstAt: now } : {}),
  }).where(and(eq(account.id, row.id), eq(account.refreshToken, refreshCiphertext)))
    .returning({ id: account.id });
  return { kind: 'upstream_error' };
}

/**
 * Revoke a character's EVE grant at CCP (RFC 7009), BEST-EFFORT. Uses the captured
 * refresh-token ciphertext, decrypts it, and revokes it at EVE's SSO endpoint so
 * the renewal path is closed upstream — not just dropped from local custody. NEVER
 * throws: a purge that calls this must finish its Neon teardown even if the revoke
 * fails (CCP down, network blip, env missing, already-dead token). A null/legacy/
 * tampered ciphertext means there is nothing valid to revoke, so we skip silently.
 *
 * Ordering: a purge calls this BEFORE its credential tier deletes the account row
 * (which carries the encrypted token) — the plaintext is needed to revoke. The
 * vend path's CAS race does not apply here: we revoke only the captured original grant; a concurrent rotation at worst revokes a now-stale token, which CCP
 * treats as a harmless no-op (200 either way).
 */
export async function revokeStoredCharacterToken(ciphertext: string | null): Promise<void> {
  try {
    const refreshToken = ciphertext ? decryptToken(ciphertext) : null;
    if (refreshToken === null) return;
    await revokeEveRefreshToken({
      refreshToken,
      clientId: requireEnv('EVE_CLIENT_ID'),
      clientSecret: requireEnv('EVE_CLIENT_SECRET'),
    });
  } catch (err) {
    console.error('[eve-token] revoke failed', err);
  }
}

export async function getFreshAccessTokenForCharacter(
  characterId: number,
  options: { forceRefresh?: boolean } = {},
): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };

  const refreshCiphertext = row.refreshToken;

  if (refreshCiphertext === null) return { kind: 'reauth_required' };

  if (!options.forceRefresh && row.authorizationFailureFirstAt &&
      row.authorizationNextCheckAt?.getTime() > Date.now()) return { kind: 'upstream_error' };

  if (hasActiveInvalidGrantGrace(row)) return { kind: 'upstream_error' };

  const refreshToken = decryptToken(refreshCiphertext);
  if (refreshToken === null) return recordRetryableFailure(row, refreshCiphertext);

  const cached = readCachedToken(row);
  if (!options.forceRefresh && cached !== null) return cached;

  const result = await refreshEveToken({
    refreshToken,
    clientId: requireEnv('EVE_CLIENT_ID'),
    clientSecret: requireEnv('EVE_CLIENT_SECRET'),
  });

  if (result.kind !== 'ok') logTokenRefreshFailure(characterId, result.failureClass);

  if (result.kind === 'retryable') {
    return recordRetryableFailure(row, refreshCiphertext, result.retryAfterMs);
  }

  if (result.kind === 'dead') return recordInvalidGrant(row, characterId, refreshCiphertext);

  const expiresAt = new Date(Date.now() + result.expires_in * 1000);
  const written = await db
    .update(account)
    .set({
      ...successfulAuthorization(),
      ...(row.authorizationFailureFirstAt || row.refreshTokenInvalidGrantCount === 1
        ? { authorizationAccessChangedAt: new Date() } : {}),
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

  return { kind: 'ok', accessToken: result.access_token, expiresAt: expiresAt.getTime() };
}
