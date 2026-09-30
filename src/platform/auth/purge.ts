import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { accountMatch, eveAccountsForUser, parseLinkedAccountId } from './eve-account-shared';
import { account, characters, corpAccessAudit, session, user } from '@/db/auth-schema';

function characterLink(userId: string, characterId: number) {
  return and(eveAccountsForUser(userId), eq(account.accountId, String(characterId)));
}

export const authPurgeContributor: PurgeContributor = {
  name: 'auth',
  tier: 'credential',
  claims: [account, session, characters],
  retained: [
    {
      table: corpAccessAudit,
      reason:
        'FK-less corp-access authz trail (3.7.3.3) — denials/decisions outlive the user or character they record, so personal-data teardown retains them; the separate 400-day retention policy ages them out.',
    },
  ],
  merge: [
    { table: account, rule: 'rekey' },
    { table: session, rule: 'rekey' },
    { table: characters, rule: 'follows-character' },
    { table: corpAccessAudit, rule: 'rekey' },
  ],
  // Strips the tokens but keeps the link: a failed purge can then be retried,
  // and the link itself is deleted last by deleteCharacterLink.
  async purgeCharacter({ userId, characterId }) {
    await db
      .update(account)
      .set({
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(characterLink(userId, characterId));
  },
};

export async function deleteCharacterLink(userId: string, characterId: number): Promise<void> {
  await db.delete(account).where(characterLink(userId, characterId));
}

export async function markCharacterDeletionRequested(
  userId: string,
  characterId: number,
): Promise<void> {
  const now = new Date();
  await db
    .update(account)
    .set({ deletionRequestedAt: now, updatedAt: now })
    .where(and(characterLink(userId, characterId), isNull(account.deletionRequestedAt)));
}

export async function markUserDeletionRequested(userId: string): Promise<void> {
  const now = new Date();
  await db
    .update(user)
    .set({ deletionRequestedAt: now, updatedAt: now })
    .where(and(eq(user.id, userId), isNull(user.deletionRequestedAt)));
}

export type PendingDeletion =
  | { readonly scope: 'user'; readonly userId: string }
  | { readonly scope: 'character'; readonly userId: string; readonly characterId: number };

/** The deletion still pending for a character's link, if any. Account deletion wins. */
export async function readPendingDeletion(characterId: number): Promise<PendingDeletion | null> {
  const [row] = await db
    .select({
      userId: account.userId,
      characterRequestedAt: account.deletionRequestedAt,
      userRequestedAt: user.deletionRequestedAt,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(accountMatch(characterId))
    .limit(1);
  if (row === undefined) return null;
  if (row.userRequestedAt !== null) return { scope: 'user', userId: row.userId };
  if (row.characterRequestedAt !== null) {
    return { scope: 'character', userId: row.userId, characterId };
  }
  return null;
}

/** Oldest pending deletions first; a character inside a pending account deletion is left to it. */
export async function readRequestedDeletions(limit: number): Promise<PendingDeletion[]> {
  const users = await db
    .select({ userId: user.id })
    .from(user)
    .where(isNotNull(user.deletionRequestedAt))
    .orderBy(asc(user.deletionRequestedAt))
    .limit(limit);
  const links = await db
    .select({ userId: account.userId, accountId: account.accountId })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(isNotNull(account.deletionRequestedAt), isNull(user.deletionRequestedAt)))
    .orderBy(asc(account.deletionRequestedAt))
    .limit(limit);
  const pending: PendingDeletion[] = users.map((row) => ({ scope: 'user', userId: row.userId }));
  for (const link of links) {
    const characterId = parseLinkedAccountId(link.accountId);
    if (characterId !== null) pending.push({ scope: 'character', userId: link.userId, characterId });
  }
  return pending;
}
