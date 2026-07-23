import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { runPurge } from '@/purge/orchestrator';
import { eveAccountsForUser } from '@/platform/auth/eve-account-shared';
import { revokeCharacterToken } from '@/platform/auth/eve-token-service';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { account, user } from '@/db/auth-schema';

/**
 * Purges one linked character, revokes its EVE grant, and reconciles the remaining account.
 */
export async function purgeOwnCharacter(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  await revokeCharacterToken(characterId);
  await runPurge({ kind: 'character', userId, characterId });
  return reconcileAfterCharacterRemoval(userId, characterId);
}

async function eveAccountIdsFor(userId: string): Promise<number[]> {
  const rows = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId));
  return rows.map((row) => Number(row.accountId)).filter((id) => Number.isFinite(id));
}

/**
 * Purges every linked character and user-keyed contributor before deleting the account owner.
 */
export async function nukeAccount(userId: string): Promise<void> {
  let linked = await eveAccountIdsFor(userId);
  while (linked.length > 0) {
    for (const characterId of linked) {
      await revokeCharacterToken(characterId);
      await runPurge({ kind: 'character', userId, characterId });
    }
    linked = await eveAccountIdsFor(userId);
  }

  await runPurge({ kind: 'user', userId });
  await db.delete(user).where(eq(user.id, userId));
}
