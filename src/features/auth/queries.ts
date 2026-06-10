import { and, asc, eq, ilike, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { EVE_PROVIDER_ID, portraitUrl } from './eve-sso';
import { account, characters, user } from './schema';
import type { Character, CharacterRole } from './types';

interface UpsertInput {
  characterId: number;
  name: string;
  portraitUrl: string;
}

// Insert on first login, update name/portrait/lastLoginAt on every subsequent login.
// `role` and `preferences` are deliberately absent from the conflict set: they're
// owned by the admin/preferences UIs once written, and must survive re-logins.
export async function upsertCharacterOnLogin(input: UpsertInput): Promise<Character> {
  const now = new Date();
  const [row] = await db
    .insert(characters)
    .values({
      characterId: input.characterId,
      name: input.name,
      portraitUrl: input.portraitUrl,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: characters.characterId,
      set: {
        name: input.name,
        portraitUrl: input.portraitUrl,
        lastLoginAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return row as Character;
}

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

function toAdminUser(row: {
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
    .where(and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))))
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
// Multi-character platform (3.4.2). A user can link several EVE characters
// (each an `account` row); these helpers list them, resolve the active one, and
// move the active pointer. The user↔character join is `account` (providerId
// 'eve', accountId = character id); per-character name/portrait live on
// `characters` and are joined in (LEFT, since a profile row can lag a fresh
// link). Ordered oldest-first by `account.createdAt` so "oldest linked" is
// deterministic — this is the fallback active character and the unlink re-point
// target.
// ---------------------------------------------------------------------------

// account_id is TEXT; characters.character_id is bigint. Cast on the account
// side so the join uses the characters PK. Shared by every account→characters
// join below.
const characterProfileJoin = eq(
  characters.characterId,
  sql`${account.accountId}::bigint`,
);

const eveAccountsForUser = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, EVE_PROVIDER_ID));

export interface LinkedCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  // Raw granted-scope string off the account row (comma-joined). Fed to
  // deriveCharacterHealth — never surfaced to the client verbatim.
  scope: string | null;
  // Whether an encrypted refresh token is still on file. The 3.4.1b "dead"
  // refresh path NULLs the token columns, so a missing token == "reconnect".
  hasRefreshToken: boolean;
  linkedAt: Date;
}

// Every EVE character linked to a user, oldest first. The page's data source —
// NOT Better Auth's /list-accounts, which carries neither name/portrait nor the
// token presence this needs (and would leak no useful health signal).
export async function listLinkedCharacters(userId: string): Promise<LinkedCharacter[]> {
  const rows = await db
    .select({
      accountId: account.accountId,
      scope: account.scope,
      refreshToken: account.refreshToken,
      createdAt: account.createdAt,
      name: characters.name,
      portraitUrl: characters.portraitUrl,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  return rows
    .map((r) => {
      const characterId = Number(r.accountId);
      return {
        characterId,
        name: r.name ?? `Character ${r.accountId}`,
        portraitUrl: r.portraitUrl ?? portraitUrl(characterId),
        scope: r.scope,
        hasRefreshToken: r.refreshToken != null && r.refreshToken.length > 0,
        linkedAt: r.createdAt,
      };
    })
    .filter((r) => Number.isFinite(r.characterId));
}

export interface ActiveCharacter {
  characterId: number;
  // From the joined `characters` row; null when the profile hasn't been written
  // yet (the caller coalesces to the user's own name/image).
  name: string | null;
  portraitUrl: string | null;
}

// Resolve the user's ACTIVE character for the session: the account named by
// `preferredId` (user.activeCharacterId) when it's still linked, else the oldest
// linked account. One indexed read (account_user_id_idx) + a characters PK join.
// If `preferredId` is set but no longer linked (its character was unlinked
// out-of-band), repoint user.activeCharacterId to the resolved char — fire-and-
// forget so getSession never blocks on a write. Returns null only when the user
// has no linked EVE account at all.
export async function resolveActiveCharacter(
  userId: string,
  preferredId: number | null,
): Promise<ActiveCharacter | null> {
  const rows = await db
    .select({
      accountId: account.accountId,
      name: characters.name,
      portraitUrl: characters.portraitUrl,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  const linked = rows
    .map((r) => ({
      characterId: Number(r.accountId),
      name: r.name,
      portraitUrl: r.portraitUrl,
    }))
    .filter((r) => Number.isFinite(r.characterId));

  if (linked.length === 0) return null;

  const preferred = preferredId != null ? linked.find((r) => r.characterId === preferredId) : undefined;
  const chosen = preferred ?? linked[0];

  if (preferredId != null && preferred === undefined) {
    void db
      .update(user)
      .set({ activeCharacterId: chosen.characterId, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .catch((err) => console.error('[auth] active-character backfill failed', err));
  }

  return { characterId: chosen.characterId, name: chosen.name, portraitUrl: chosen.portraitUrl };
}

// True when the given character is one of this user's linked EVE accounts. The
// ownership guard the switch/unlink routes gate on — never trust a posted id.
export async function accountBelongsToUser(userId: string, characterId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .limit(1);
  return row != null;
}

// Point the user's active character at the given (already-validated) character.
export async function setActiveCharacter(userId: string, characterId: number): Promise<void> {
  await db
    .update(user)
    .set({ activeCharacterId: characterId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

// Re-point the active character to the user's oldest remaining linked account
// (NULL when none remain). Called after unlinking the active character so the
// session never references a deleted account. Returns the new active id.
export async function repointActiveToOldest(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt))
    .limit(1);

  const parsed = row ? Number(row.accountId) : null;
  const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  await db
    .update(user)
    .set({ activeCharacterId: next, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return next;
}

// The user's CURRENTLY-stored active character id (NULL if none). Read fresh
// from the row — used by unlink to decide whether to re-point, rather than
// trusting the session snapshot captured at the top of the request (which a
// concurrent switch could have made stale).
export async function getStoredActiveCharacterId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.activeCharacterId ?? null;
}
