import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { accountMatch, eveAccountsForUser, parseLinkedAccountId } from './eve-account-shared';
import { account, characters, corpAccessAudit, session, user } from '@/db/auth-schema';
import { pendingDeletions } from './deletion-schema';

function characterLink(userId: string, characterId: number) {
  return and(eveAccountsForUser(userId), eq(account.accountId, String(characterId)));
}

export const authPurgeContributor: PurgeContributor = {
  name: 'auth',
  tier: 'credential',
  claims: [account, session, characters],
  retained: [
    {
      table: pendingDeletions,
      reason: 'Deletion coordinator owns its receipt through final reconciliation; contributor deletion would deadlock its row lock. Completion deletes it, failed requests remain for retry.',
    },
    {
      table: corpAccessAudit,
      reason:
        'FK-less corp-access authz trail (3.7.3.3) — denials/decisions outlive the user or character they record, so personal-data teardown retains them; the separate 400-day retention policy ages them out.',
    },
  ],
  merge: [
    {
      tables: [pendingDeletions],
      rule: 'custom',
      reason: 'The merge coordinator rejects pending deletion before moving identity; deletion receipts never move to another user.',
      async merge(database, { sourceUserId, survivorUserId }) {
        const rows = await database.select({ id: pendingDeletions.id }).from(pendingDeletions)
          .where(eq(pendingDeletions.userId, sourceUserId)).limit(1);
        if (rows.length > 0) throw new Error(`Cannot merge pending deletion for ${survivorUserId}`);
      },
    },
    { table: account, rule: 'rekey' },
    { table: session, rule: 'rekey' },
    { table: characters, rule: 'follows-character' },
    { table: corpAccessAudit, rule: 'rekey' },
  ],
  // Strips the tokens but keeps the link: a failed purge can then be retried,
  // and the lifecycle coordinator deletes the exact link last.
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

export type PendingDeletion =
  | { readonly scope: 'user'; readonly userId: string; readonly requestedAt: Date }
  | { readonly scope: 'character'; readonly userId: string; readonly characterId: number; readonly accountRowId: string; readonly requestedAt: Date };

/** The deletion still pending for a character's link, if any. Account deletion wins. */
export async function readPendingDeletion(characterId: number): Promise<PendingDeletion | null> {
  const [row] = await db
    .select({
      userId: account.userId,
      accountRowId: account.id,
      characterRequestedAt: account.deletionRequestedAt,
      userRequestedAt: user.deletionRequestedAt,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(accountMatch(characterId))
    .limit(1);
  if (row === undefined) return null;
  if (row.userRequestedAt !== null) return { scope: 'user', userId: row.userId, requestedAt: row.userRequestedAt };
  if (row.characterRequestedAt !== null) {
    return { scope: 'character', userId: row.userId, characterId, accountRowId: row.accountRowId, requestedAt: row.characterRequestedAt };
  }
  return null;
}

/** Oldest pending deletions first; a character inside a pending account deletion is left to it. */
export async function readRequestedDeletions(limit: number): Promise<PendingDeletion[]> {
  const [users, links] = await Promise.all([
    db
      .select({ userId: user.id, requestedAt: user.deletionRequestedAt })
      .from(user)
      .leftJoin(pendingDeletions, eq(pendingDeletions.userId, user.id))
      .where(and(isNotNull(user.deletionRequestedAt), isNull(pendingDeletions.id)))
      .orderBy(asc(user.deletionRequestedAt))
      .limit(limit),
    db
      .select({ userId: account.userId, accountId: account.accountId, accountRowId: account.id, requestedAt: account.deletionRequestedAt })
      .from(account)
      .innerJoin(user, eq(user.id, account.userId))
      .leftJoin(pendingDeletions, eq(pendingDeletions.userId, user.id))
      .where(and(isNotNull(account.deletionRequestedAt), isNull(user.deletionRequestedAt), isNull(pendingDeletions.id)))
      .orderBy(asc(account.deletionRequestedAt))
      .limit(limit),
  ]);
  const pending: PendingDeletion[] = users.flatMap((row) => row.requestedAt === null ? [] : [{ scope: 'user' as const, userId: row.userId, requestedAt: row.requestedAt }]);
  for (const link of links) {
    const characterId = parseLinkedAccountId(link.accountId);
    if (characterId !== null && link.requestedAt !== null) pending.push({ scope: 'character', userId: link.userId, characterId, accountRowId: link.accountRowId, requestedAt: link.requestedAt });
  }
  return pending;
}
