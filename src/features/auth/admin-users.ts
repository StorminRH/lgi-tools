import { and, asc, eq, gt, ilike, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { accountMatch, eveAccountsForUser } from './eve-account-shared';
import { EVE_PROVIDER_ID } from './eve-sso';
import { getStoredActiveCharacterId, repointActiveToOldest } from './linked-characters';
import { account, session, user } from './schema';
import type { CharacterRole } from './types';

// Admin-dashboard row: a user (the unit admin is granted on) joined to its
// linked EVE character's display fields. characterId is null only if a user has
// no EVE account, which shouldn't happen for a real pilot.
export interface AdminUser {
  userId: string;
  characterId: number | null;
  name: string;
  portraitUrl: string;
  role: CharacterRole;
}

const adminUserColumns = {
  userId: user.id,
  name: user.name,
  portraitUrl: user.image,
  role: user.role,
  characterId: account.accountId,
};

export function toAdminUser(row: {
  userId: string;
  name: string;
  portraitUrl: string | null;
  role: CharacterRole;
  characterId: string | null;
}): AdminUser {
  const parsed = row.characterId != null ? Number(row.characterId) : null;
  return {
    userId: row.userId,
    name: row.name,
    portraitUrl: row.portraitUrl ?? '',
    role: row.role,
    characterId: parsed !== null && Number.isFinite(parsed) ? parsed : null,
  };
}

// Join the user to exactly ONE linked EVE account — their OLDEST — so a user who
// has linked multiple characters (3.4.2) yields a single admin-list row instead
// of one row per character. The NOT EXISTS keeps only the account with no earlier
// sibling for the same user (created_at, id as the tiebreak). This also makes
// getUserById's single-account pick deterministic. Oldest-first matches the
// session resolver's fallback. getUserByCharacterId is unaffected — it queries
// one specific character, not the fan-out join.
function oldestEveAccountJoin() {
  const older = alias(account, 'older_eve_account');
  return and(
    eq(account.userId, user.id),
    eq(account.providerId, EVE_PROVIDER_ID),
    notExists(
      db
        .select({ one: sql`1` })
        .from(older)
        .where(
          and(
            eq(older.userId, user.id),
            eq(older.providerId, EVE_PROVIDER_ID),
            or(
              lt(older.createdAt, account.createdAt),
              and(eq(older.createdAt, account.createdAt), lt(older.id, account.id)),
            ),
          ),
        ),
    ),
  );
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, oldestEveAccountJoin())
    .where(eq(user.role, 'ADMIN'))
    .orderBy(asc(user.name));

  return rows.map(toAdminUser);
}

export async function getUserById(userId: string): Promise<AdminUser | null> {
  const [row] = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, oldestEveAccountJoin())
    .where(eq(user.id, userId))
    .limit(1);

  return row ? toAdminUser(row) : null;
}

// Resolve the user that owns a given EVE character id — used to map the env
// superadmin (a character id) onto the per-user model for the admin list.
export async function getUserByCharacterId(characterId: number): Promise<AdminUser | null> {
  const [row] = await db
    .select(adminUserColumns)
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(accountMatch(characterId))
    .limit(1);

  return row ? toAdminUser(row) : null;
}

// Cap on rows the admin name search displays. A 1-char query matches a large
// fraction of the table, which only grows; bound the display and let the
// dashboard hint when there's more. Exported so the UI can show "showing first N".
export const CHARACTER_SEARCH_LIMIT = 50;

// Substring ILIKE search over a user's display name (their linked character's
// name). Empty/whitespace-only queries short-circuit to [] so the dashboard's
// empty-q view doesn't fetch the world. Fetches ONE row past the display cap as
// a truncation probe: a caller that gets back CHARACTER_SEARCH_LIMIT + 1 rows
// knows the result was cut off (vs a result that just happens to be exactly the
// cap), so the "showing first N" hint can't false-positive on a naturally
// cap-sized match set.
export async function searchUsersByLinkedCharacterName(query: string): Promise<AdminUser[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const rows = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, oldestEveAccountJoin())
    .where(ilike(user.name, `%${trimmed}%`))
    .orderBy(asc(user.name))
    .limit(CHARACTER_SEARCH_LIMIT + 1);

  return rows.map(toAdminUser);
}

// Flips a user's role. Returns null when no row matches (i.e. the caller passed
// a userId that isn't in the table).
export async function setUserRole(
  userId: string,
  role: CharacterRole,
): Promise<AdminUser | null> {
  const [row] = await db
    .update(user)
    .set({ role, updatedAt: sql`now()` })
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  if (!row) return null;
  return getUserById(userId);
}

// ---------------------------------------------------------------------------
// Admin character management. These act on an ARBITRARY user (not the caller),
// so they're direct DB writes rather than Better Auth API calls — auth.api
// .unlinkAccount only ever targets the session's own user. Admin gating +
// ownership checks live in the /api/admin/* route handlers; these helpers
// assume already-validated inputs. The encrypted EVE tokens are columns on the
// `account` row, so deleting/moving the row carries them with it.
// ---------------------------------------------------------------------------

// Remove one linked EVE character from a user (admin force-unlink). Returns
// whether a row was actually deleted. Caller re-points the user's active
// character if this was it (mirrors the self-service unlink route).
export async function deleteLinkedCharacter(
  userId: string,
  characterId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .returning({ id: account.id });
  return deleted.length > 0;
}

// Force-logout: delete every session row for a user. Returns the count removed.
// Note: with the session cookie cache on, an already-issued cookie can keep a
// user "signed in" until it expires (cookieCache.maxAge) and getSession next
// revalidates against the now-missing row — so revocation isn't instantaneous.
export async function revokeUserSessions(userId: string): Promise<number> {
  const deleted = await db
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return deleted.length;
}

// Count of a user's currently-valid (non-expired) sessions — context for the
// admin force-logout control. Expired rows are pruned lazily by Better Auth, so
// filter them out here rather than counting stale rows.
export async function getActiveSessionCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
  return rows.length;
}

// Move a single linked character from one user onto another (admin reassign —
// the one-click merge). The unique key is (providerId, accountId), so changing
// only userId never conflicts. If the source user is left with no EVE accounts
// the source `user` row is deleted (its sessions cascade) — an account-less
// user can never be signed into again, so this is the natural completion of a
// merge, not a separate destructive delete. If the source keeps other
// characters, its active pointer is re-aimed when we moved the active one.
// Writes are sequential (the request-path neon-http client is transaction-free);
// the operation is admin-only and low-rate, so the brief non-atomic window is
// acceptable — same trade-off the self-service unlink route already makes.
export async function reassignCharacter({
  characterId,
  fromUserId,
  toUserId,
}: {
  characterId: number;
  fromUserId: string;
  toUserId: string;
}): Promise<{ sourceDeleted: boolean }> {
  // Pinned as-is for characterization: if this compare-and-swap moves zero rows,
  // the survivor scan below can still delete an already-empty source user.
  await db
    .update(account)
    .set({ userId: toUserId, updatedAt: new Date() })
    .where(
      and(
        eq(account.providerId, EVE_PROVIDER_ID),
        eq(account.accountId, String(characterId)),
        eq(account.userId, fromUserId),
      ),
    );

  const [remaining] = await db
    .select({ id: account.id })
    .from(account)
    .where(eveAccountsForUser(fromUserId))
    .limit(1);

  if (!remaining) {
    await db.delete(user).where(eq(user.id, fromUserId));
    return { sourceDeleted: true };
  }

  const active = await getStoredActiveCharacterId(fromUserId);
  if (active === characterId) {
    await repointActiveToOldest(fromUserId);
  }
  return { sourceDeleted: false };
}
