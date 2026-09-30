import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { deletionDatabase } from '@/db/deletion-client';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { runPurge } from '@/composition/purge/orchestrator';
import { accountMatch, eveAccountsForUser, parseLinkedAccountId } from '@/platform/auth/eve-account-shared';
import { revokeStoredCharacterToken } from '@/platform/auth/eve-token-service';
import { deleteUserIfUnlinked, reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { readPendingDeletion, readRequestedDeletions, type PendingDeletion } from '@/platform/auth/purge';
import {
  enqueueDeletion, enqueueTransfer, jobsForCharacter, readDeletionJobs,
  requestDeletion, rotateDeletionJob, type DeletionJob,
} from '@/platform/auth/deletion-jobs';
import { pendingDeletions } from '@/platform/auth/deletion-schema';
import { account, user } from '@/db/auth-schema';
import { finishCharacterTransfer } from './character-transfer';

async function purgeLink(link: Pick<typeof account.$inferSelect, 'id' | 'userId' | 'accountId' | 'refreshToken'>): Promise<void> {
  const characterId = parseLinkedAccountId(link.accountId);
  if (characterId === null) return;
  await revokeStoredCharacterToken(link.refreshToken);
  await runPurge({ kind: 'character', userId: link.userId, characterId });
  await db.delete(account).where(and(eq(account.id, link.id), eq(account.userId, link.userId)));
}

async function finishUserDeletion(job: DeletionJob): Promise<void> {
  const [owner] = await db.select({ requestedAt: user.deletionRequestedAt }).from(user).where(eq(user.id, job.userId));
  if (owner === undefined || owner.requestedAt?.getTime() !== job.requestedAt.getTime()) return;
  for (;;) {
    const linked = await db.select().from(account).where(eveAccountsForUser(job.userId));
    if (linked.length > 0) {
      for (const link of linked) {
        if (parseLinkedAccountId(link.accountId) === null) throw new Error('Cannot purge malformed EVE character identifier.');
        await purgeLink(link);
      }
      continue;
    }
    await runPurge({ kind: 'user', userId: job.userId });
    if (await deleteUserIfUnlinked(job.userId)) return;
  }
}

async function finishCharacterDeletion(job: DeletionJob): Promise<{ accountEmptied: boolean }> {
  if (job.characterId === null || job.accountRowId === null) throw new Error('Character deletion has no original link.');
  const [link] = await db.select().from(account).where(and(eq(account.id, job.accountRowId), eq(account.userId, job.userId), accountMatch(job.characterId)));
  if (link !== undefined) {
    if (link.deletionRequestedAt?.getTime() !== job.requestedAt.getTime()) return { accountEmptied: false };
    await purgeLink(link);
  }
  // The independent receipt survives unlink, so a retry resumes reconciliation only.
  return reconcileAfterCharacterRemoval(job.userId, job.characterId, identityProjectionRunners);
}

/** Lock only the independent receipt; global purge writes never touch this row. */
async function finishDeletionJob(id: string): Promise<{ accountEmptied: boolean } | undefined> {
  return deletionDatabase().transaction(async (tx) => {
    const [job] = await tx.select().from(pendingDeletions).where(eq(pendingDeletions.id, id)).for('update');
    if (job === undefined) return undefined;
    let result: { accountEmptied: boolean } | undefined;
    if (job.scope === 'user') await finishUserDeletion(job);
    else if (job.scope === 'character') result = await finishCharacterDeletion(job);
    else {
      if (job.characterId === null) throw new Error('Transfer has no character.');
      await finishCharacterTransfer(job.userId, job.characterId, job.accountRowId);
    }
    await tx.delete(pendingDeletions).where(eq(pendingDeletions.id, job.id));
    return result ?? { accountEmptied: job.scope === 'user' };
  });
}

async function finishRequestedDeletion(request: PendingDeletion): Promise<{ accountEmptied: boolean }> {
  for (;;) {
    const job = await enqueueDeletion(request);
    if (job === undefined) return { accountEmptied: false };
    const result = await finishDeletionJob(job.id);
    const matches = job.scope === request.scope
      && job.requestedAt.getTime() === request.requestedAt.getTime()
      && (request.scope === 'user' || job.accountRowId === request.accountRowId);
    if (matches) return result ?? { accountEmptied: false };
  }
}

export async function purgeOwnCharacter(userId: string, characterId: number): Promise<{ accountEmptied: boolean }> {
  const request = await requestDeletion(userId, characterId);
  return request === null ? { accountEmptied: false } : finishRequestedDeletion(request);
}

export async function nukeAccount(userId: string): Promise<void> {
  const request = await requestDeletion(userId);
  if (request !== null) await finishRequestedDeletion(request);
}

export async function transferCharacter(userId: string, characterId: number, accountRowId?: string): Promise<void> {
  for (;;) {
    const job = await enqueueTransfer(userId, characterId, accountRowId);
    if (job === undefined) return;
    await finishDeletionJob(job.id);
    if (job.scope === 'transfer' && job.characterId === characterId) return;
  }
}

export async function finishPendingDeletion(characterId: number): Promise<void> {
  for (;;) {
    const jobs = await jobsForCharacter(characterId);
    if (jobs.length > 0) {
      for (const job of jobs) await finishDeletionJob(job.id);
      continue;
    }
    const request = await readPendingDeletion(characterId);
    if (request === null) return;
    await finishRequestedDeletion(request);
  }
}

const DELETION_RETRY_BATCH = 20;

export async function retryRequestedDeletions(deadline: number): Promise<{ retried: number; failed: number }> {
  if (Date.now() >= deadline) return { retried: 0, failed: 0 };
  // Existing jobs are excluded by discovery, so poisoned oldest markers cannot
  // prevent new requests from entering the fair, independently ordered queue.
  for (const request of await readRequestedDeletions(DELETION_RETRY_BATCH)) await enqueueDeletion(request);
  const jobs = await readDeletionJobs(DELETION_RETRY_BATCH);
  let retried = 0;
  let failed = 0;
  for (const job of jobs) {
    if (Date.now() >= deadline) break;
    try {
      if (await finishDeletionJob(job.id) !== undefined) retried += 1;
    } catch (error) {
      failed += 1;
      console.error('[account-purge] requested deletion retry failed', { id: job.id, userId: job.userId, scope: job.scope }, error);
      await rotateDeletionJob(job.id);
    }
  }
  return { retried, failed };
}
