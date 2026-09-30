import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { account } from '@/db/auth-schema';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { runPurge } from '@/composition/purge/orchestrator';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { accountMatch } from '@/platform/auth/eve-account-shared';

export async function finishCharacterTransfer(
  priorUserId: string,
  characterId: number,
  accountRowId: string | null,
): Promise<void> {
  const original = accountRowId === null ? undefined : and(eq(account.id, accountRowId), eq(account.userId, priorUserId), accountMatch(characterId));
  const [link] = original === undefined ? [] : await db.select({ id: account.id }).from(account).where(original);
  const mapIds = link === undefined ? [] : await identityProjectionRunners.runBeforeCharacterUnlink({ userId: priorUserId, characterId });
  try {
    if (link !== undefined) {
      await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);
      await db.delete(account).where(original);
    }
  } catch (error) {
    await identityProjectionRunners.runAfterFailedCharacterUnlink(characterId);
    throw error;
  }
  try {
    await identityProjectionRunners.runAfterCharacterUnlink({ userId: priorUserId, characterId, mapIds });
  } finally {
    await reconcileAfterCharacterRemoval(priorUserId, characterId, identityProjectionRunners, true);
    await identityProjectionRunners.runAfterCharacterLinkChanged({
      userId: priorUserId,
      characterId,
    });
  }
}
