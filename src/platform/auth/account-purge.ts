import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { eveAccountsForUser } from './eve-account-shared';
import { repointActiveToOldest } from './linked-characters';
import { account, user } from '@/db/auth-schema';
import { syntheticEmail } from './synthetic-email';

// Reconcile a user row after one of its characters has been torn down. Shared by
// the transfer-purge (owner-hash) and the self-service character-purge — the same
// two outcomes either way:
//   - No EVE accounts left ⇒ the user is permanently un-loginable (EVE SSO is the
//     only login), so delete it. Sessions + user_preferences + custom_structures
//     cascade (onDelete:'cascade') — the deliberate completion of the purge,
//     mirroring the admin reassignCharacter precedent.
//   - Siblings remain ⇒ if the freed character was the identity email, rebind it to
//     a surviving character. Better Auth's findOAuthUser falls back to a user.email
//     match when no account row is found, and overrideUserInfo keeps that email
//     tracking the last-signed-in character's synthetic <id>@eve.invalid — so a
//     surviving user.email == the freed character's synthetic address would re-link
//     it. Also repoint the active character if it was the freed one.
// Returns whether the account was emptied (and thus the user deleted) — the signal
// the self-service purge surfaces so the UI knows the session is gone. Sequential,
// non-atomic neon-http writes (no request-path transaction) — the accepted
// reassignCharacter trade-off; a purge is rare and low-rate.
//
// PRECONDITION: the caller must have ALREADY run the credential-tier purge for
// `characterId` (which deletes its `account` row) before calling this — the
// remaining-accounts count below must not still see the removed character, or it
// would count itself a survivor and wrongly return accountEmptied=false. Both
// purge callers (purgeOwnCharacter, purgeTransferredCharacter) run runPurge first.
// Transfer callers (absorbLinkedCharacterOnProof and the admin character-reassign
// route) satisfy the same invariant by MOVING the row first — the source's
// remaining-scan no longer sees it.
/** @internal */
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
