import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/db';
import { EVE_PROVIDER_ID } from './eve-sso';
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

const eveAccountJoin = and(
  eq(account.userId, user.id),
  eq(account.providerId, EVE_PROVIDER_ID),
);

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, eveAccountJoin)
    .where(eq(user.role, 'ADMIN'))
    .orderBy(asc(user.name));

  return rows.map(toAdminUser);
}

export async function getUserById(userId: string): Promise<AdminUser | null> {
  const [row] = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, eveAccountJoin)
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
    .leftJoin(account, eveAccountJoin)
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
