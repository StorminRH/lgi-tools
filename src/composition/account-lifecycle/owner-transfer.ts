import { db } from '@/db';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { runPurge } from '@/composition/purge/orchestrator';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { accountMatch } from '@/platform/auth/eve-account-shared';
import { classifyOwnerReconcile } from '@/platform/auth/owner-reconcile';
import { account } from '@/db/auth-schema';

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

export async function purgeTransferredCharacter(
  priorUserId: string,
  characterId: number,
): Promise<void> {
  const mapIds = await identityProjectionRunners.runBeforeCharacterUnlink({ userId: priorUserId, characterId });
  try {
    await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);
  } catch (error) {
    await identityProjectionRunners.runAfterFailedCharacterUnlink(characterId);
    throw error;
  }
  await identityProjectionRunners.runAfterCharacterUnlink({ userId: priorUserId, characterId, mapIds });
  await reconcileAfterCharacterRemoval(priorUserId, characterId, identityProjectionRunners);
  await identityProjectionRunners.runAfterCharacterLinkChanged({
    userId: priorUserId,
    characterId,
  });
}
