import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { runPurge } from '@/purge/orchestrator';
import { eveAccountsForUser } from './eve-account-shared';
import { revokeCharacterToken } from './eve-token-service';
import { repointActiveToOldest } from './linked-characters';
import { account, user } from './schema';
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
// callers (purgeOwnCharacter, purgeTransferredCharacter) run runPurge first.
// The third caller (absorbLinkedCharacterOnProof) satisfies the same invariant
// by MOVING the row first — the source's remaining-scan no longer sees it.
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

// ---------------------------------------------------------------------------
// Self-service account safety (ACCOUNT.2). These act on the CALLER's OWN account;
// the route handler owns the session gate + ownership check, these own the
// auth-identity orchestration. Writes are sequential, non-atomic neon-http — the
// reassignCharacter/purgeTransferredCharacter trade-off (a purge is rare).
// ---------------------------------------------------------------------------

/**
 * Purge one of the caller's own characters — the destructive counterpart to unlink.
 * Where unlink (deleteLinkedCharacter) only detaches the account row, this scrubs
 * ALL of the character's derived data and revokes its EVE grant upstream. Order:
 *   1. Revoke the EVE refresh token at CCP (best-effort — never aborts the purge),
 *      BEFORE the credential tier below deletes the stored token.
 *   2. runPurge ALL tiers (credential link+tokens → cache mirrors incl. the Convex
 *      online doc → durable), the full per-character sweep.
 *   3. Reconcile the user row: a last-character purge empties the account, so the
 *      user is deleted (a de-facto nuke) and accountEmptied is true; otherwise the
 *      identity email is rebound + active repointed and accountEmptied is false.
 * The returned accountEmptied tells the caller/UI whether the account (and session)
 * is gone — the D-5 redirect-to-authorized-apps lightbox shows only when emptied.
 */
export async function purgeOwnCharacter(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  await revokeCharacterToken(characterId);
  await runPurge({ kind: 'character', userId, characterId });
  return reconcileAfterCharacterRemoval(userId, characterId);
}

// The character ids of a user's currently-linked EVE accounts.
async function eveAccountIdsFor(userId: string): Promise<number[]> {
  const rows = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId));
  return rows.map((r) => Number(r.accountId)).filter((id) => Number.isFinite(id));
}

/**
 * Nuke the caller's entire account. The user-row delete cascades
 * session/account/user_preferences/custom_structures, but the per-character caches
 * (skills, jobs, owned assets/blueprints, telemetry) key on character_id with no
 * user FK, so they do NOT cascade — they must be swept per character first. So:
 *   - for each linked character: revoke its EVE grant (best-effort) + runPurge its
 *     per-character tiers (credential-first, so nothing can re-sync mid-purge);
 *   - runPurge the per-user tiers (the user-keyed tables with no FK — e.g. the corp
 *     jobs board — plus the user-axis Convex online teardown);
 *   - delete the user row (the cascade finishes the cascading tables).
 * "N character purges + 1 user purge + the user-row delete" (src/purge/types.ts).
 *
 * Re-enumerate until no EVE account remains rather than snapshotting once: a
 * character linked concurrently (after an enumeration) would otherwise be
 * cascade-orphaned by the final user-row drop — its account row gone, its
 * character-keyed caches surviving with no later sync to reap them. Each pass purges
 * the linked set (the credential tier deletes those account rows), so the next pass
 * sees only a newcomer or nothing; it converges because a pilot cannot complete the
 * EVE link flow faster than a pass purges. The neon-http path has no transaction, so
 * this shrinks the race to the negligible gap before the delete, not fully closing it.
 */
export async function nukeAccount(userId: string): Promise<void> {
  let linked = await eveAccountIdsFor(userId);
  while (linked.length > 0) {
    for (const characterId of linked) {
      await revokeCharacterToken(characterId);
      await runPurge({ kind: 'character', userId, characterId });
    }
    linked = await eveAccountIdsFor(userId);
  }

  await runPurge({ kind: 'user', userId });
  await db.delete(user).where(eq(user.id, userId));
}
