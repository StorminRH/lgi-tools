import { and, asc, eq, gt, ilike, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { accountMatch, eveAccountsForUser } from './eve-account-shared';
import { EVE_PROVIDER_ID } from './eve-sso';
import {
  runAfterCharacterLinkChanged,
  runBeforeUserDelete,
} from './identity-projection-hooks';
import { getStoredActiveCharacterId, repointActiveToOldest } from './linked-characters';
import { account, session, user } from '@/db/auth-schema';
import type { CharacterRole } from './types';

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

export async function getUserByCharacterId(characterId: number): Promise<AdminUser | null> {
  const [row] = await db
    .select(adminUserColumns)
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(accountMatch(characterId))
    .limit(1);

  return row ? toAdminUser(row) : null;
}

export const CHARACTER_SEARCH_LIMIT = 50;

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

export async function deleteLinkedCharacter(
  userId: string,
  characterId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .returning({ id: account.id });
  if (deleted.length === 0) return false;
  await runAfterCharacterLinkChanged({ userId, characterId });
  return true;
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const deleted = await db
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return deleted.length;
}

export async function getActiveSessionCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
  return rows.length;
}

export async function reassignCharacter({
  characterId,
  fromUserId,
  toUserId,
}: {
  characterId: number;
  fromUserId: string;
  toUserId: string;
}): Promise<{ sourceDeleted: boolean }> {
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
    await runBeforeUserDelete(fromUserId);
    await db.delete(user).where(eq(user.id, fromUserId));
    await runAfterCharacterLinkChanged({ userId: fromUserId, characterId });
    return { sourceDeleted: true };
  }

  const active = await getStoredActiveCharacterId(fromUserId);
  if (active === characterId) {
    await repointActiveToOldest(fromUserId);
  }
  await runAfterCharacterLinkChanged({ userId: fromUserId, characterId });
  return { sourceDeleted: false };
}
