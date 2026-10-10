import { and, asc, eq, gt, isNotNull, isNull, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { account } from '@/db/auth-schema';
import { EVE_PROVIDER_ID } from './eve-sso';
import { authorizationFailureCutoff } from './authorization-policy';

function ownerCondition(userId: string) {
  return and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.userId, userId));
}

/** Unsuspended accounts whose failures began at or before the cutoff, so they are due for suspension. */
function overdueUnsuspended(cutoff: Date): SQL | undefined {
  return and(eq(account.authorizationSuspended, false), lte(account.authorizationFailureFirstAt, cutoff));
}

/**
 * The complement of the overdue bound: no unresolved failure, or one that began
 * after the cutoff. `lte` on a NULL first-failure is NULL, hence the IS NULL branch.
 */
export function authorizationFailureCurrent(cutoff: Date): SQL | undefined {
  return or(isNull(account.authorizationFailureFirstAt), gt(account.authorizationFailureFirstAt, cutoff));
}

export async function hasAuthorizationWork(userId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db.select({ id: account.id }).from(account).where(and(ownerCondition(userId), or(
    and(isNotNull(account.refreshToken), lte(account.authorizationNextCheckAt, now)),
    isNotNull(account.authorizationAccessChangedAt),
    overdueUnsuspended(authorizationFailureCutoff(now.getTime())),
  ))).limit(1);
  return rows.length > 0;
}

export async function listDueAuthorizations(userId: string) {
  return db.select({ id: account.id, characterId: account.accountId, dueAt: account.authorizationNextCheckAt })
    .from(account).where(and(ownerCondition(userId), isNotNull(account.refreshToken),
      lte(account.authorizationNextCheckAt, new Date())))
    .orderBy(asc(account.authorizationNextCheckAt), asc(account.id)).limit(40);
}

/** A short persisted lease deduplicates overlapping visits/crons without holding a DB connection over SSO. */
export async function claimAuthorization(id: string): Promise<boolean> {
  const rows = await db.update(account).set({ authorizationNextCheckAt: new Date(Date.now() + 2 * 60_000) })
    .where(and(eq(account.id, id), lte(account.authorizationNextCheckAt, new Date()), isNotNull(account.refreshToken)))
    .returning({ id: account.id });
  return rows.length > 0;
}

export async function suspendOverdueAuthorizations(userId: string): Promise<void> {
  await db.update(account).set({ authorizationSuspended: true, authorizationAccessChangedAt: new Date() })
    .where(and(ownerCondition(userId), overdueUnsuspended(authorizationFailureCutoff())));
}

export async function listAuthorizationAccessChanges(userId: string) {
  return db.select({ id: account.id, characterId: account.accountId, changedAt: account.authorizationAccessChangedAt })
    .from(account).where(and(ownerCondition(userId), isNotNull(account.authorizationAccessChangedAt)))
    .orderBy(asc(account.authorizationAccessChangedAt), asc(account.id)).limit(100);
}

export async function acknowledgeAuthorizationAccessChange(id: string, changedAt: Date): Promise<void> {
  await db.update(account).set({ authorizationAccessChangedAt: null })
    .where(and(eq(account.id, id), eq(account.authorizationAccessChangedAt, changedAt)));
}
