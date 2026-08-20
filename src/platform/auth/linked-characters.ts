import { asc, and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { characterProfileJoin, eveAccountsForUser, parseLinkedAccountId } from './eve-account-shared';
import { portraitUrl } from './eve-sso';
import { account, characters, user } from '@/db/auth-schema';
import type { Character } from './types';

/** Login-owned character columns. Role and preferences are not in this write. */
interface CharacterLoginIdentity {
  characterId: number;
  name: string;
  portraitUrl: string;
}

type CharacterLoginIdentityWrite = {
  name: string;
  portraitUrl: string;
  lastLoginAt: Date;
  updatedAt: Date;
};

export async function upsertCharacterLoginIdentity(
  input: CharacterLoginIdentity,
): Promise<Character> {
  const now = new Date();
  const loginIdentity: CharacterLoginIdentityWrite = {
    name: input.name,
    portraitUrl: input.portraitUrl,
    lastLoginAt: now,
    updatedAt: now,
  };
  const [row] = await db
    .insert(characters)
    .values({
      characterId: input.characterId,
      ...loginIdentity,
    })
    .onConflictDoUpdate({
      target: characters.characterId,
      set: loginIdentity,
    })
    .returning();

  return row as Character;
}

/** User-owned linked EVE character with token availability, granted scopes, and display identity. */
export interface LinkedCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  scope: string | null;
  hasRefreshToken: boolean;
  linkedAt: Date;
  corporationId: number | null;
  affiliationRefreshedAt: Date | null;
}

function toLinkedCharacter(
  characterId: number,
  r: {
    accountId: string;
    scope: string | null;
    refreshToken: string | null;
    createdAt: Date;
    name: string | null;
    portraitUrl: string | null;
    corporationId: number | null;
    affiliationRefreshedAt: Date | null;
  },
): LinkedCharacter {
  return {
    characterId,
    name: r.name ?? `Character ${r.accountId}`,
    portraitUrl: r.portraitUrl ?? portraitUrl(characterId),
    scope: r.scope,
    hasRefreshToken: r.refreshToken != null && r.refreshToken.length > 0,
    linkedAt: r.createdAt,
    corporationId: r.corporationId ?? null,
    affiliationRefreshedAt: r.affiliationRefreshedAt ?? null,
  };
}

export async function listLinkedCharacters(userId: string): Promise<LinkedCharacter[]> {
  const rows = await db
    .select({
      accountId: account.accountId,
      scope: account.scope,
      refreshToken: account.refreshToken,
      createdAt: account.createdAt,
      name: characters.name,
      portraitUrl: characters.portraitUrl,
      corporationId: characters.corporationId,
      affiliationRefreshedAt: characters.affiliationRefreshedAt,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  return rows.flatMap((r) => {
    const characterId = parseLinkedAccountId(r.accountId);
    return characterId === null ? [] : [toLinkedCharacter(characterId, r)];
  });
}

/** Linked character selected for active account operations. */
export interface ActiveCharacter {
  characterId: number;
  name: string | null;
  portraitUrl: string | null;
}

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

  const linked = rows.flatMap((r) => {
    const characterId = parseLinkedAccountId(r.accountId);
    return characterId === null
      ? []
      : [{ characterId, name: r.name, portraitUrl: r.portraitUrl }];
  });

  const [first] = linked;
  if (first === undefined) return null;

  const preferred = preferredId != null ? linked.find((r) => r.characterId === preferredId) : undefined;
  const chosen = preferred ?? first;

  if (preferredId != null && preferred === undefined) {
    scheduleStaleActiveCharacterRepair(userId, chosen.characterId);
  }

  return { characterId: chosen.characterId, name: chosen.name, portraitUrl: chosen.portraitUrl };
}

function scheduleStaleActiveCharacterRepair(userId: string, characterId: number): void {
  void db
    .update(user)
    .set({ activeCharacterId: characterId, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .catch((err) => console.error('[auth] active-character backfill failed', err));
}

export async function accountBelongsToUser(userId: string, characterId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .limit(1);
  return row != null;
}

/** Point the user's active character at the given (already-validated) character. */
export async function setActiveCharacter(userId: string, characterId: number): Promise<void> {
  await db
    .update(user)
    .set({ activeCharacterId: characterId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

/**
 * Re-point the active character to the user's oldest remaining linked account
 * (NULL when none remain). Called after unlinking the active character so the
 * session never references a deleted account. Returns the new active id.
 */
export async function repointActiveToOldest(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt))
    .limit(1);

  const next = row ? parseLinkedAccountId(row.accountId) : null;
  await db
    .update(user)
    .set({ activeCharacterId: next, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return next;
}

export async function getStoredActiveCharacterId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.activeCharacterId ?? null;
}
