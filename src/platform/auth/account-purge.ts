import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { eveAccountsForUser } from './eve-account-shared';
import { runBeforeUserDelete } from './identity-projection-hooks';
import { repointActiveToOldest } from './linked-characters';
import { account, user } from '@/db/auth-schema';
import { syntheticEmail } from './synthetic-email';

export async function reconcileAfterCharacterRemoval(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  const remaining = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  const [firstRemaining] = remaining;
  if (firstRemaining === undefined) {

    await runBeforeUserDelete(userId);
    await db.delete(user).where(eq(user.id, userId));
    return { accountEmptied: true };
  }

  const [u] = await db
    .select({ email: user.email, activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (u?.email === syntheticEmail(characterId)) {
    await db
      .update(user)
      .set({ email: syntheticEmail(Number(firstRemaining.accountId)), updatedAt: new Date() })
      .where(eq(user.id, userId));
  }
  if (u?.activeCharacterId === characterId) {
    await repointActiveToOldest(userId);
  }
  return { accountEmptied: false };
}
