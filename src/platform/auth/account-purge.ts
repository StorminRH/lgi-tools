import { and, asc, eq, notExists } from 'drizzle-orm';
import { db } from '@/db';
import { withLockedUsers } from '@/db/locked-user';
import { isUniqueViolation } from '@/db/pg-errors';
import type { AnyPgDb } from '@/lib/db-types';
import { accountMatch, eveAccountsForUser, linkedCharacterIds } from './eve-account-shared';
import type { IdentityProjectionRunners } from './identity-projection-runners';
import { repointActiveToOldest } from './linked-characters';
import { account, user } from '@/db/auth-schema';
import { syntheticEmail, syntheticEmailCharacterId, unlinkedEmail } from './synthetic-email';

export async function deleteUserIfUnlinked(userId: string): Promise<boolean> {
  return withLockedUsers([userId], async (tx) => {
    const [linked] = await tx.select({ id: account.id }).from(account)
      .where(eveAccountsForUser(userId)).limit(1);
    if (linked !== undefined) return false;
    await tx.delete(user).where(eq(user.id, userId));
    return true;
  });
}

/** Whether `email` is a synthetic address for a character outside `linkedIds`. */
function namesUnlinkedCharacter(email: string, linkedIds: readonly number[]): boolean {
  const named = syntheticEmailCharacterId(email);
  return named !== null && !linkedIds.includes(named);
}

/**
 * Rewrites a synthetic email that names a character the user no longer has:
 * to the oldest remaining parseable link's address, or to the user's own
 * placeholder when no link parses or another user holds that address. It
 * re-reads under the user's row lock, so concurrent removals settle on a
 * character the user still has.
 */
async function repairUserEmail(userId: string): Promise<void> {
  await withLockedUsers([userId], async (tx) => {
    const [row] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
    const linkedIds = linkedCharacterIds(await tx.select({ accountId: account.accountId }).from(account)
      .where(eveAccountsForUser(userId)).orderBy(asc(account.createdAt), asc(account.id)));
    if (row === undefined || !namesUnlinkedCharacter(row.email, linkedIds)) return;
    const [replacement] = linkedIds;
    if (replacement !== undefined && await trySetEmail(tx, userId, syntheticEmail(replacement))) return;
    await setEmail(tx, userId, unlinkedEmail(userId));
  });
}

/** Sets the email in a savepoint; false when another user holds that address. */
async function trySetEmail(tx: AnyPgDb, userId: string, email: string): Promise<boolean> {
  try {
    await tx.transaction((savepoint) => setEmail(savepoint, userId, email));
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return false;
  }
}

async function setEmail(database: AnyPgDb, userId: string, email: string): Promise<void> {
  await database.update(user).set({ email, updatedAt: new Date() }).where(eq(user.id, userId));
}

/**
 * Repairs the user whose synthetic email names `characterId` without owning
 * it. EVE sign-in runs this before Better Auth looks the character up, so an
 * email that a failed repair or older code left stale neither refuses that
 * sign-in by email nor collides when overrideUserInfo writes the address to
 * the character's owner.
 */
export async function releaseSyntheticEmail(characterId: number): Promise<void> {
  const owns = db.select({ id: account.id }).from(account)
    .where(and(eq(account.userId, user.id), accountMatch(characterId)));
  const [holder] = await db.select({ id: user.id }).from(user)
    .where(and(eq(user.email, syntheticEmail(characterId)), notExists(owns)))
    .limit(1);
  if (holder !== undefined) await repairUserEmail(holder.id);
}

async function repairUserIdentity(
  userId: string,
  characterId: number,
  linkedIds: readonly number[],
): Promise<void> {
  const [u] = await db
    .select({ email: user.email, activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (u !== undefined && namesUnlinkedCharacter(u.email, linkedIds)) {
    await repairUserEmail(userId);
  }
  if (u?.activeCharacterId === characterId) {
    await repointActiveToOldest(userId);
  }
}

export async function reconcileAfterCharacterRemoval(
  userId: string,
  characterId: number,
  runners: IdentityProjectionRunners,
): Promise<{ accountEmptied: boolean }> {
  let restoreProjection = false;
  for (;;) {
    const remaining = await db.select({ accountId: account.accountId }).from(account)
      .where(eveAccountsForUser(userId)).orderBy(asc(account.createdAt));
    // Any EVE row, parseable or not, keeps the user, as in deleteUserIfUnlinked.
    if (remaining.length === 0) {
      await runners.runBeforeUserDelete(userId);
      if (await deleteUserIfUnlinked(userId)) return { accountEmptied: true };
      restoreProjection = true;
      continue;
    }
    const remainingCharacterIds = linkedCharacterIds(remaining);
    await repairUserIdentity(userId, characterId, remainingCharacterIds);
    if (restoreProjection) {
      for (const remainingCharacterId of remainingCharacterIds) {
        await runners.runAfterCharacterLinkChanged({ userId, characterId: remainingCharacterId });
      }
    }
    return { accountEmptied: false };
  }
}
