import { getOAuthState } from 'better-auth/api';
import { logUsageEvent } from '@/data/telemetry/queries';
import { db } from '@/db';
import { reconcileAfterCharacterRemoval } from './account-purge';
import { reassignCharacter } from './admin-users';
import { accountMatch } from './eve-account-shared';
import type { IdentityProjectionRunners } from './identity-projection-runners';
import { account } from '@/db/auth-schema';

/**
 * Absorb-on-proof (ACCOUNT.3, D-4): during the OAuth *link* callback, if the
 * just-proven character already lives on a DIFFERENT user (a stray duplicate
 * account), move it onto the linking user BEFORE Better Auth's own account
 * lookup — the already-linked refusal becomes the normal same-user relink
 * (the token/scope update lands on the moved row). Authorized solely by the
 * completed OAuth proof: the character id comes from the verified EVE JWT
 * (getUserInfo calls this), the target user from the server-stored OAuth state
 * (link.userId, set from the session that initiated /oauth2/link), and the
 * callback is single-use (state row deleted on parse, state-cookie-bound,
 * code single-use at EVE) — pinned by absorb-link.spike.test.ts. fromUserId is
 * read from the account row so reassignCharacter's userId predicate acts as a
 * compare-and-swap: a lost concurrent race matches zero rows and the flow
 * degrades to the refusal. Best-effort by contract: ANY throw (including
 * getOAuthState outside a request, or after a Better Auth bump that moves the
 * state store) is logged loudly and reported as no-absorb — sign-in and link
 * must never break on this.
 */
export async function absorbLinkedCharacterOnProof(
  characterId: number,
  runners: IdentityProjectionRunners,
): Promise<{ absorbed: boolean }> {
  try {
    const state = (await getOAuthState()) as { link?: { userId: string } } | null;
    const link = state?.link;
    if (!link) return { absorbed: false };

    const [row] = await db
      .select({ userId: account.userId })
      .from(account)
      .where(
        accountMatch(characterId),
      )
      .limit(1);
    if (!row) return { absorbed: false };
    if (row.userId === link.userId) return { absorbed: false };

    const { sourceDeleted } = await reassignCharacter({
      characterId,
      fromUserId: row.userId,
      toUserId: link.userId,
      runners,
    });
    if (!sourceDeleted) {
      try {
        await reconcileAfterCharacterRemoval(row.userId, characterId, runners);
      } catch (err) {
        console.error('[auth] absorb source cleanup failed after the move committed', err);
      }
    }
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
