import { after } from 'next/server';
import { db } from '@/db';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { runPurge } from '@/composition/purge/orchestrator';
import { reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import type { CharacterProof, ProofOutcome } from '@/platform/auth/auth';
import { accountMatch } from '@/platform/auth/eve-account-shared';
import { readOwnerHashClaim } from '@/platform/auth/owner-hash-claim';
import { classifyProof, type ProofDecision } from '@/platform/auth/owner-reconcile';
import { decryptToken } from '@/platform/auth/token-crypto';
import { account } from '@/db/auth-schema';
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

async function backfillOwnerHash(characterId: number, ownerHash: string): Promise<void> {
  await db
    .update(account)
    .set({ ownerHash, updatedAt: new Date() })
    .where(accountMatch(characterId));
}

async function mergeProvenCharacter(
  proof: CharacterProof & { ownerHash: string },
  decision: Extract<ProofDecision, { kind: 'merge' }>,
): Promise<ProofOutcome> {
  if (decision.backfill) await backfillOwnerHash(proof.characterId, proof.ownerHash);
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
    console.error('[auth] account merge failed before commit; standard link flow continues', error);
    return NONE;
  }
}

/**
 * Owner reconcile, transfer purge and account merge decided once per proven
 * character. Returns 'merged' only after the Neon transaction committed; a
 * merge failure degrades to 'none' so Better Auth refuses the link as before.
 */
export async function proveCharacter(proof: CharacterProof): Promise<ProofOutcome> {
  const jwtOwnerHash = proof.ownerHash;
  if (!jwtOwnerHash) return NONE;
  const [row] = await db
    .select({ userId: account.userId, ownerHash: account.ownerHash, accessToken: account.accessToken })
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
      await backfillOwnerHash(proof.characterId, jwtOwnerHash);
      return NONE;
    case 'transfer':
      await purgeTransferredCharacter(row.userId, proof.characterId);
      return NONE;
    case 'merge':
      return mergeProvenCharacter({ ...proof, ownerHash: jwtOwnerHash }, decision);
  }
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
