import { getOAuthState } from 'better-auth/api';
import { lt } from 'drizzle-orm';
import { logUsageEvent } from '@/data/telemetry/queries';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { runPurge } from '@/purge/orchestrator';
import { reconcileAfterCharacterRemoval } from './account-purge';
import { reassignCharacter } from './admin-users';
import { accountMatch } from './eve-account-shared';
import { classifyOwnerReconcile } from './owner-reconcile';
import { account, verification } from './schema';

// AF-004 migration map: Session 3.8.5.4.2 moved the linked-character and
// affiliation axes (plus the slice-private eve-account-shared predicates) out
// 1:1; the 18 exports remaining in this temporary hub move into admin-users
// (12), owner-transfer (3), account-purge (2), and verification-retention (1)
// during Session 3.8.5.4.3, which then deletes this file. The owner tags below
// keep the caller inventory auditable; this file exports no compatibility
// facade at any point in the migration.

// [3.8.5.4 owner: verification-retention]
export async function pruneExpiredVerifications(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(verification).where(lt(verification.expiresAt, cutoff));
}

// Absorb-on-proof (ACCOUNT.3, D-4): during the OAuth *link* callback, if the
// just-proven character already lives on a DIFFERENT user (a stray duplicate
// account), move it onto the linking user BEFORE Better Auth's own account
// lookup — the already-linked refusal becomes the normal same-user relink
// (the token/scope update lands on the moved row). Authorized solely by the
// completed OAuth proof: the character id comes from the verified EVE JWT
// (getUserInfo calls this), the target user from the server-stored OAuth state
// (link.userId, set from the session that initiated /oauth2/link), and the
// callback is single-use (state row deleted on parse, state-cookie-bound,
// code single-use at EVE) — pinned by absorb-link.spike.test.ts. fromUserId is
// read from the account row so reassignCharacter's userId predicate acts as a
// compare-and-swap: a lost concurrent race matches zero rows and the flow
// degrades to the refusal. Best-effort by contract: ANY throw (including
// getOAuthState outside a request, or after a Better Auth bump that moves the
// state store) is logged loudly and reported as no-absorb — sign-in and link
// must never break on this.
// [3.8.5.4 owner: owner-transfer]
export async function absorbLinkedCharacterOnProof(
  characterId: number,
): Promise<{ absorbed: boolean }> {
  try {
    const state = (await getOAuthState()) as { link?: { userId: string } } | null;
    const link = state?.link; // present ONLY on link flows
    if (!link) return { absorbed: false }; // sign-in: never absorb

    const [row] = await db
      .select({ userId: account.userId })
      .from(account)
      .where(
        accountMatch(characterId),
      )
      .limit(1);
    if (!row) return { absorbed: false }; // fresh link — Better Auth creates it
    if (row.userId === link.userId) return { absorbed: false }; // normal relink of your own character

    const { sourceDeleted } = await reassignCharacter({
      characterId,
      fromUserId: row.userId,
      toUserId: link.userId,
    });
    // The move is COMMITTED from here on. Cleanup and reporting failures must
    // degrade individually — the outer catch must never see them, or a
    // committed move would report no-absorb: the audit event dropped, the UI
    // note suppressed, and the stale-email hazard silently left open.
    if (!sourceDeleted) {
      // reassignCharacter skips the source identity-email rebind on the
      // not-emptied fork; reconcileAfterCharacterRemoval is idempotent over the
      // overlap (no delete — survivors remain; the active re-point already
      // happened) and adds ONLY the email rebind, closing the findOAuthUser
      // email-fallback hazard (a stale synthetic address could resurrect the
      // stray account if the character's row is ever deleted later).
      try {
        await reconcileAfterCharacterRemoval(row.userId, characterId);
      } catch (err) {
        console.error('[auth] absorb source cleanup failed after the move committed', err);
      }
    }
    // Audit trail — a disputed absorb must be investigable (and reversible via
    // the admin reassign). Fire-and-forget like the auth_login event: telemetry
    // must never block or fail the link.
    void logUsageEvent({
      action: 'auth_absorb',
      characterId,
      metadata: { fromUserId: row.userId, toUserId: link.userId, sourceDeleted },
    }).catch((err) => console.error('[auth] absorb telemetry write failed', err));
    return { absorbed: true };
  } catch (err) {
    console.error('[auth] absorb-on-proof failed — falling back to the standard link flow', err);
    return { absorbed: false };
  }
}

// ---------------------------------------------------------------------------
// Owner-hash identity binding (3.7.1.3). EVE's JWT `owner` claim
// (CharacterOwnerHash) is stable for one human across logins and changes only
// when the character is transferred to a different EVE account. We store it on
// the account row and reconcile it on every auth (from getUserInfo, BEFORE
// Better Auth's own account lookup), so a transferred character can never sign
// the new human into the prior owner's LGI account.
//
// The verdict (no-op / backfill / purge) is the pure classifyOwnerReconcile in
// owner-reconcile.ts; these helpers act on it against the DB.
// ---------------------------------------------------------------------------

// Compare the JWT's owner hash against the stored one for a character and act on
// the difference. Called once per sign-in/link. Cheap on the common paths: one
// indexed read, plus a single backfill UPDATE the first time a legacy/fresh row
// records its hash.
// [3.8.5.4 owner: owner-transfer]
export async function reconcileCharacterOwner(
  characterId: number,
  jwtOwnerHash: string | null | undefined,
): Promise<void> {
  if (!jwtOwnerHash) return; // no owner claim → no transfer proof, never act

  const [row] = await db
    .select({ userId: account.userId, ownerHash: account.ownerHash })
    .from(account)
    .where(accountMatch(characterId))
    .limit(1);
  // No row yet = this character's first link this request; Better Auth creates
  // the account row AFTER this callback, so there is nothing to compare. The
  // fresh row starts with a NULL owner_hash and backfills on its next auth —
  // identical to a legacy row, never a false purge.
  if (!row) return;

  const action = classifyOwnerReconcile(row.ownerHash, jwtOwnerHash);
  if (action === 'noop') return;
  if (action === 'backfill') {
    await db
      .update(account)
      .set({ ownerHash: jwtOwnerHash, updatedAt: new Date() })
      .where(
        accountMatch(characterId),
      );
    return;
  }
  // action === 'purge': a different human now controls this character.
  await purgeTransferredCharacter(row.userId, characterId);
}

// Purge a transferred character's prior owner, then let Better Auth create a fresh
// user for the new owner (it finds no account row, so its findOAuthUser email
// fallback no longer re-links to the prior owner). Surface:
//   1–2. credential + owner-authored profile teardown — the purge registry's
//        credential tier (src/features/auth/purge.ts): account row + encrypted
//        tokens, then reset the owner-authored fields on the shared `characters`
//        row (kept — a telemetry FK target). A NEW per-character owner-authored
//        table is covered by claiming it in its slice's purge contributor, not by
//        editing here (the registry is now the home of which tables this touches).
//   3.   the prior owner's user row — reconciled below (delete when account-less,
//        else rebind the identity email + repoint active). Auth-identity logic, so
//        it stays here rather than in a generic contributor.
// ONLY the credential tier runs: the trackers' per-character caches (skills +
// personal/corp jobs, owned assets/blueprints) are regenerable and re-sync under
// the new owner, so they must NOT be torn down; the online-status canary doc is
// reaped by its lazy orphan cleanup in onlineStatus.applySyncResults. Steps are
// sequential, non-atomic neon-http writes (no request-path transaction) — the same
// accepted trade-off as reassignCharacter; a transfer is rare and low-rate.
// [3.8.5.4 owner: owner-transfer]
export async function purgeTransferredCharacter(
  priorUserId: string,
  characterId: number,
): Promise<void> {
  // 1–2. Credential + owner-authored profile teardown via the purge registry.
  await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);

  // 3. Reconcile the prior owner's user row — delete when account-less, else rebind
  //    the identity email off the freed character + repoint active. Shared with the
  //    self-service character-purge (account-purge's reconcileAfterCharacterRemoval).
  await reconcileAfterCharacterRemoval(priorUserId, characterId);
}
