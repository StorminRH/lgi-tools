import { db } from '@/db';
import { runPurge } from '@/composition/purge/orchestrator';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { accountMatch } from '@/platform/auth/eve-account-shared';
import { classifyOwnerReconcile } from '@/platform/auth/owner-reconcile';
import { account } from '@/db/auth-schema';

/**
 * Reconciles an EVE character's verified owner hash with stored custody.
 */
export async function reconcileCharacterOwner(
  characterId: number,
  jwtOwnerHash: string | null | undefined,
): Promise<void> {
  if (!jwtOwnerHash) return;

  const [row] = await db
    .select({ userId: account.userId, ownerHash: account.ownerHash })
    .from(account)
    .where(accountMatch(characterId))
    .limit(1);
  if (!row) return;

  const action = classifyOwnerReconcile(row.ownerHash, jwtOwnerHash);
  if (action === 'noop') return;
  if (action === 'backfill') {
    await db
      .update(account)
      .set({ ownerHash: jwtOwnerHash, updatedAt: new Date() })
      .where(accountMatch(characterId));
    return;
  }
  await purgeTransferredCharacter(row.userId, characterId);
}

/**
 * Purges transferred character custody and reconciles the prior owner's remaining account.
 */
export async function purgeTransferredCharacter(
  priorUserId: string,
  characterId: number,
): Promise<void> {
  await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);
  await reconcileAfterCharacterRemoval(priorUserId, characterId);
}
