import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { db, directClient } from '@/db';
import { eveAccountsForUser } from './eve-account-shared';
import type { IdentityProjectionRunners } from './identity-projection-runners';
import { repointActiveToOldest } from './linked-characters';
import { account, user } from '@/db/auth-schema';
import { syntheticEmail } from './synthetic-email';

export async function deleteUserIfUnlinked(userId: string): Promise<boolean> {
  return drizzle(directClient).transaction(async (tx) => {
    // Account inserts take an FK key-share lock: lock first, then read a fresh snapshot.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for('update');
    const [linked] = await tx.select({ id: account.id }).from(account)
      .where(eveAccountsForUser(userId)).limit(1);
    if (linked !== undefined) return false;
    await tx.delete(user).where(eq(user.id, userId));
    return true;
  });
}

async function repairUserIdentity(userId: string, characterId: number, replacementAccountId: string): Promise<void> {
  const [u] = await db
    .select({ email: user.email, activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (u?.email === syntheticEmail(characterId)) {
    await db
      .update(user)
      .set({ email: syntheticEmail(Number(replacementAccountId)), updatedAt: new Date() })
      .where(eq(user.id, userId));
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
    const [firstRemaining] = remaining;
    if (firstRemaining === undefined) {
      await runners.runBeforeUserDelete(userId);
      if (await deleteUserIfUnlinked(userId)) return { accountEmptied: true };
      restoreProjection = true;
      continue;
    }
    await repairUserIdentity(userId, characterId, firstRemaining.accountId);
    if (restoreProjection) {
      for (const link of remaining) {
        await runners.runAfterCharacterLinkChanged({ userId, characterId: Number(link.accountId) });
      }
    }
    return { accountEmptied: false };
  }
}
