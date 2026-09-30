import { and, eq, isNull } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/db';
import type { CharacterProof, ProofOutcome } from '@/platform/auth/auth';
import { accountMatch } from '@/platform/auth/eve-account-shared';
import { readOwnerHashClaim } from '@/platform/auth/owner-hash-claim';
import { classifyProof, type ProofDecision } from '@/platform/auth/owner-reconcile';
import { decryptToken } from '@/platform/auth/token-crypto';
import { account } from '@/db/auth-schema';
import { finishPendingDeletion, transferCharacter } from './account-purge';
import { PendingDeletionError } from '@/platform/auth/deletion-jobs';
import { mergeUsers, settleConvexAfterMerge } from './account-merge';

const NONE: ProofOutcome = { kind: 'none' };

function storedTokenOwnerHash(accessToken: string | null): string | null {
  if (!accessToken) return null;
  try {
    return readOwnerHashClaim(decryptToken(accessToken));
  } catch {
    return null;
  }
}

type ObservedAccount = Pick<typeof account.$inferSelect, 'id' | 'userId' | 'accessToken'>;

async function backfillOwnerHash(observed: ObservedAccount, ownerHash: string): Promise<boolean> {
  // Evidence belongs to this exact stored row, not a later link for the same character.
  const updated = await db
    .update(account)
    .set({ ownerHash, updatedAt: new Date() })
    .where(and(
      eq(account.id, observed.id),
      eq(account.userId, observed.userId),
      isNull(account.ownerHash),
      observed.accessToken === null
        ? isNull(account.accessToken)
        : eq(account.accessToken, observed.accessToken),
    ))
    .returning({ id: account.id });
  return updated.length > 0;
}

async function mergeProvenCharacter(
  proof: CharacterProof & { ownerHash: string },
  decision: Extract<ProofDecision, { kind: 'merge' }>,
  observed: ObservedAccount,
): Promise<ProofOutcome> {
  if (decision.backfill && !await backfillOwnerHash(observed, proof.ownerHash)) return NONE;
  try {
    const result = await mergeUsers({
      linkingUserId: decision.linkingUserId,
      otherUserId: decision.otherUserId,
      provenCharacterId: proof.characterId,
      jwtOwnerHash: proof.ownerHash,
    });
    if (result.kind === 'noop') {
      console.warn('[auth] account merge converged without changes', result.reason);
      return NONE;
    }
    after(() => settleConvexAfterMerge(result));
    return { kind: 'merged', survivorUserId: result.survivorUserId, sourceUserId: result.sourceUserId };
  } catch (error) {
    if (error instanceof PendingDeletionError) throw error;
    console.error('[auth] account merge failed before commit; standard link flow continues', error);
    return NONE;
  }
}

export async function proveCharacter(proof: CharacterProof): Promise<ProofOutcome> {
  await finishPendingDeletion(proof.characterId);
  const jwtOwnerHash = proof.ownerHash;
  if (!jwtOwnerHash) return NONE;
  const [row] = await db
    .select({ id: account.id, userId: account.userId, ownerHash: account.ownerHash, accessToken: account.accessToken })
    .from(account)
    .where(accountMatch(proof.characterId))
    .limit(1);
  if (!row) return NONE;

  const decision = classifyProof({
    jwtOwnerHash,
    columnOwnerHash: row.ownerHash,
    tokenOwnerHash: row.ownerHash ? null : storedTokenOwnerHash(row.accessToken),
    accountUserId: row.userId,
    linkingUserId: proof.linkingUserId,
  });
  switch (decision.kind) {
    case 'noop':
      return NONE;
    case 'refuse-unverified':
      console.warn('[auth] cross-user link proof with no owner evidence on the stored row; nothing moves', {
        characterId: proof.characterId,
        linkingUserId: proof.linkingUserId,
        accountUserId: row.userId,
      });
      return NONE;
    case 'backfill':
      await backfillOwnerHash(row, jwtOwnerHash);
      return NONE;
    case 'transfer':
      await purgeTransferredCharacter(row.userId, proof.characterId, row.id);
      return NONE;
    case 'merge':
      return mergeProvenCharacter({ ...proof, ownerHash: jwtOwnerHash }, decision, row);
  }
}

export async function purgeTransferredCharacter(
  priorUserId: string,
  characterId: number,
  accountRowId?: string,
): Promise<void> {
  await transferCharacter(priorUserId, characterId, accountRowId);
}
