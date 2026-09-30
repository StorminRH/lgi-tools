import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { deletionDatabase } from '@/db/deletion-client';
import { account, user } from '@/db/auth-schema';
import type { AnyPgDb } from '@/lib/db-types';
import { accountMatch, eveAccountsForUser, parseLinkedAccountId } from './eve-account-shared';
import { pendingDeletions } from './deletion-schema';
import type { PendingDeletion } from './purge';

export type DeletionJob = typeof pendingDeletions.$inferSelect;

export class PendingDeletionError extends Error {
  constructor() { super('Account deletion must finish before identity can move.'); }
}

async function existingJob(database: AnyPgDb, userId: string) {
  const [job] = await database.select().from(pendingDeletions)
    .where(eq(pendingDeletions.userId, userId)).limit(1);
  return job;
}

async function lockUser(database: AnyPgDb, userId: string) {
  return database.select({ id: user.id }).from(user).where(eq(user.id, userId)).for('update');
}

async function insertJob(database: AnyPgDb, request: PendingDeletion) {
  const linked = await database.select({ accountId: account.accountId }).from(account)
    .where(eveAccountsForUser(request.userId));
  const characterIds = linked.flatMap((row) => {
    const id = parseLinkedAccountId(row.accountId);
    return id === null ? [] : [id];
  });
  const [job] = await database.insert(pendingDeletions).values({
    userId: request.userId,
    scope: request.scope,
    requestedAt: request.requestedAt,
    characterIds: request.scope === 'character' ? [request.characterId] : characterIds,
    ...(request.scope === 'character' ? {
      accountRowId: request.accountRowId,
      characterId: request.characterId,
    } : {}),
  }).returning();
  return job;
}

async function requestStillPending(database: AnyPgDb, request: PendingDeletion) {
  if (request.scope === 'user') {
    return database.select({ id: user.id }).from(user)
      .where(and(eq(user.id, request.userId), eq(user.deletionRequestedAt, request.requestedAt)));
  }
  return database.select({ id: account.id }).from(account).where(and(
    eq(account.id, request.accountRowId), eq(account.userId, request.userId),
    accountMatch(request.characterId), eq(account.deletionRequestedAt, request.requestedAt),
  ));
}

/** The user lock matches merge initialization; never wait for a job lock while holding it. */
export async function enqueueDeletion(request: PendingDeletion): Promise<DeletionJob | undefined> {
  return deletionDatabase().transaction(async (tx) => {
    await lockUser(tx, request.userId);
    const existing = await existingJob(tx, request.userId);
    if (existing !== undefined) return existing;
    if ((await requestStillPending(tx, request)).length === 0) return undefined;
    return insertJob(tx, request);
  });
}

export async function requestDeletion(userId: string, characterId?: number): Promise<PendingDeletion | null> {
  return deletionDatabase().transaction(async (tx) => {
    const owners = await lockUser(tx, userId);
    if (owners.length === 0) return null;
    const now = new Date();
    if (characterId === undefined) {
      await tx.update(user).set({ deletionRequestedAt: now, updatedAt: now })
        .where(and(eq(user.id, userId), isNull(user.deletionRequestedAt)));
      const [owner] = await tx.select({ requestedAt: user.deletionRequestedAt }).from(user)
        .where(eq(user.id, userId));
      return owner?.requestedAt ? { scope: 'user', userId, requestedAt: owner.requestedAt } : null;
    }
    await tx.update(account).set({ deletionRequestedAt: now, updatedAt: now })
      .where(and(eveAccountsForUser(userId), accountMatch(characterId), isNull(account.deletionRequestedAt)));
    const [link] = await tx.select({ accountRowId: account.id, requestedAt: account.deletionRequestedAt })
      .from(account).where(and(eveAccountsForUser(userId), accountMatch(characterId)));
    return link?.requestedAt ? { scope: 'character', userId, characterId, accountRowId: link.accountRowId, requestedAt: link.requestedAt } : null;
  });
}

export async function readDeletionJobs(limit: number): Promise<DeletionJob[]> {
  return db.select().from(pendingDeletions).orderBy(asc(pendingDeletions.queuedAt), asc(pendingDeletions.id)).limit(limit);
}

/** A detached link must still find its whole-user or character cleanup receipt. */
export async function jobsForCharacter(characterId: number): Promise<DeletionJob[]> {
  const owners = db.select({ userId: account.userId }).from(account).where(accountMatch(characterId));
  return db.select().from(pendingDeletions).where(or(
    eq(pendingDeletions.characterId, characterId),
    sql`${pendingDeletions.characterIds} @> ${JSON.stringify([characterId])}::jsonb`,
    sql`${pendingDeletions.userId} IN (${owners})`,
  )).orderBy(asc(pendingDeletions.queuedAt), asc(pendingDeletions.id));
}

export async function rotateDeletionJob(id: string): Promise<void> {
  await db.update(pendingDeletions).set({ queuedAt: new Date() }).where(eq(pendingDeletions.id, id));
}

export async function enqueueTransfer(userId: string, characterId: number, accountRowId?: string): Promise<DeletionJob | undefined> {
  return deletionDatabase().transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await existingJob(tx, userId);
    if (existing !== undefined) return existing;
    const [link] = await tx.select({ id: account.id }).from(account).where(and(
      eveAccountsForUser(userId), accountMatch(characterId),
      accountRowId === undefined ? undefined : eq(account.id, accountRowId),
    ));
    if (link === undefined) return undefined;
    const [job] = await tx.insert(pendingDeletions).values({
      userId, scope: 'transfer', accountRowId: link.id, characterId,
      characterIds: [characterId], requestedAt: new Date(),
    }).returning();
    return job;
  });
}

export async function usersHavePendingDeletion(database: AnyPgDb, userIds: string[]): Promise<boolean> {
  const [row] = await database.select({ id: pendingDeletions.id }).from(pendingDeletions)
    .where(inArray(pendingDeletions.userId, userIds)).limit(1);
  if (row !== undefined) return true;
  const [owner] = await database.select({ id: user.id }).from(user)
    .where(and(inArray(user.id, userIds), isNotNull(user.deletionRequestedAt))).limit(1);
  if (owner !== undefined) return true;
  const [link] = await database.select({ id: account.id }).from(account)
    .where(and(inArray(account.userId, userIds), isNotNull(account.deletionRequestedAt))).limit(1);
  return link !== undefined;
}
