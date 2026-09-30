import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { runPurge } from '@/composition/purge/orchestrator';
import { eveAccountsForUser } from '@/platform/auth/eve-account-shared';
import { revokeCharacterToken } from '@/platform/auth/eve-token-service';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import {
  deleteCharacterLink,
  markCharacterDeletionRequested,
  markUserDeletionRequested,
  readPendingDeletion,
  readRequestedDeletions,
  type PendingDeletion,
} from '@/platform/auth/purge';
import { account, user } from '@/db/auth-schema';

// The link is deleted last: until every other step succeeds it is what a retry finds.
async function purgeCharacterData(userId: string, characterId: number): Promise<void> {
  await revokeCharacterToken(characterId);
  await runPurge({ kind: 'character', userId, characterId });
  await deleteCharacterLink(userId, characterId);
}

export async function purgeOwnCharacter(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  await markCharacterDeletionRequested(userId, characterId);
  await purgeCharacterData(userId, characterId);
  return reconcileAfterCharacterRemoval(userId, characterId, identityProjectionRunners);
}

async function eveAccountIdsFor(userId: string): Promise<number[]> {
  const rows = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId));
  return rows.map((row) => Number(row.accountId)).filter((id) => Number.isFinite(id));
}

export async function nukeAccount(userId: string): Promise<void> {
  await markUserDeletionRequested(userId);
  let linked = await eveAccountIdsFor(userId);
  while (linked.length > 0) {
    for (const characterId of linked) {
      await purgeCharacterData(userId, characterId);
    }
    linked = await eveAccountIdsFor(userId);
  }

  await runPurge({ kind: 'user', userId });
  await db.delete(user).where(eq(user.id, userId));
}

function finishDeletion(pending: PendingDeletion): Promise<unknown> {
  return pending.scope === 'user'
    ? nukeAccount(pending.userId)
    : purgeOwnCharacter(pending.userId, pending.characterId);
}

/** A character whose deletion is still pending finishes it before it can sign in again. */
export async function finishPendingDeletion(characterId: number): Promise<void> {
  const pending = await readPendingDeletion(characterId);
  if (pending !== null) await finishDeletion(pending);
}

const DELETION_RETRY_BATCH = 20;

/** Daily retry of deletions that failed part-way; each attempt resumes from the kept link or user. */
export async function retryRequestedDeletions(
  deadline: number,
): Promise<{ retried: number; failed: number }> {
  const pending = await readRequestedDeletions(DELETION_RETRY_BATCH);
  let retried = 0;
  let failed = 0;
  for (const deletion of pending) {
    if (Date.now() >= deadline) break;
    try {
      await finishDeletion(deletion);
      retried += 1;
    } catch (error) {
      failed += 1;
      console.error('[account-purge] requested deletion retry failed', deletion, error);
    }
  }
  return { retried, failed };
}
