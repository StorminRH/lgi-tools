import { asc, and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { characterProfileJoin, eveAccountsForUser } from './eve-account-shared';
import { portraitUrl } from './eve-sso';
import { account, characters, user } from './schema';
import type { Character } from './types';

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

interface UpsertInput {
  characterId: number;
  name: string;
  portraitUrl: string;
}

/**
 * Insert on first login, update name/portrait/lastLoginAt on every subsequent login.
 * `role` and `preferences` are deliberately absent from the conflict set: they're
 * owned by the admin/preferences UIs once written, and must survive re-logins.
 */
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
  // Cached corp affiliation (3.7.3.2). corporationId feeds the Convex corp sync
  // (resolveCorpSubjects reads it instead of an inline ESI call);
  // affiliationRefreshedAt lets the enumeration route stale-gate its on-view
  // refresh. NULL until the first affiliation refresh.
  corporationId: number | null;
  affiliationRefreshedAt: Date | null;
}

/**
 * Shape one account→characters join row into a LinkedCharacter: fall back to a
 * synthesised name/portrait when the profile row is missing, and flag whether a
 * usable refresh token is still on file. Pure — the join lives in the query.
 */
export function toLinkedCharacter(r: {
  accountId: string;
  scope: string | null;
  refreshToken: string | null;
  createdAt: Date;
  name: string | null;
  portraitUrl: string | null;
  corporationId: number | null;
  affiliationRefreshedAt: Date | null;
}): LinkedCharacter {
  const characterId = Number(r.accountId);
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

/**
 * Every EVE character linked to a user, oldest first. The page's data source —
 * NOT Better Auth's /list-accounts, which carries neither name/portrait nor the
 * token presence this needs (and would leak no useful health signal).
 */
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

  return rows.map(toLinkedCharacter).filter((r) => Number.isFinite(r.characterId));
}

export interface ActiveCharacter {
  characterId: number;
  // From the joined `characters` row; null when the profile hasn't been written
  // yet (the caller coalesces to the user's own name/image).
  name: string | null;
  portraitUrl: string | null;
}

/**
 * Resolve the user's ACTIVE character for the session: the account named by
 * `preferredId` (user.activeCharacterId) when it's still linked, else the oldest
 * linked account. One indexed read (account_user_id_idx) + a characters PK join.
 * If `preferredId` is set but no longer linked (its character was unlinked
 * out-of-band), repoint user.activeCharacterId to the resolved char — fire-and-
 * forget so getSession never blocks on a write. Returns null only when the user
 * has no linked EVE account at all.
 */
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

  const [first] = linked;
  if (first === undefined) return null;

  const preferred = preferredId != null ? linked.find((r) => r.characterId === preferredId) : undefined;
  const chosen = preferred ?? first;

  if (preferredId != null && preferred === undefined) {
    void db
      .update(user)
      .set({ activeCharacterId: chosen.characterId, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .catch((err) => console.error('[auth] active-character backfill failed', err));
  }

  return { characterId: chosen.characterId, name: chosen.name, portraitUrl: chosen.portraitUrl };
}

/**
 * True when the given character is one of this user's linked EVE accounts. The
 * ownership guard the switch/unlink routes gate on — never trust a posted id.
 */
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

  const parsed = row ? Number(row.accountId) : null;
  const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  await db
    .update(user)
    .set({ activeCharacterId: next, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return next;
}

/**
 * The user's CURRENTLY-stored active character id (NULL if none). Read fresh
 * from the row — used by unlink to decide whether to re-point, rather than
 * trusting the session snapshot captured at the top of the request (which a
 * concurrent switch could have made stale).
 */
export async function getStoredActiveCharacterId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.activeCharacterId ?? null;
}
