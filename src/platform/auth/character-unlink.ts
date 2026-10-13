import { reconcileAfterCharacterRemoval } from './account-purge';
import type { IdentityProjectionRunners } from './identity-projection-runners';

/**
 * Removes one linked EVE character from `userId` between the identity
 * projection runners, then settles the account through
 * reconcileAfterCharacterRemoval, which repoints the active character,
 * rewrites a synthetic email that names a character the user no longer has,
 * and deletes a user left with no EVE links. A later EVE sign-in as the
 * removed character repeats the email repair (releaseSyntheticEmail), so a
 * failed settle cannot strand it.
 *
 * A revocation or removal failure comes back as an outcome, so each caller
 * chooses how to report it; failures after the removal propagate. A
 * runAfterCharacterUnlink failure still settles, then rethrows, and a settle
 * failure still runs the linkChanged runners and afterSettle, then rethrows:
 * the removal has committed, so its projections must still follow it.
 */
export async function unlinkCharacter({
  userId,
  characterId,
  runners,
  remove,
  settleOnMiss = false,
  afterSettle,
}: {
  userId: string;
  characterId: number;
  runners: IdentityProjectionRunners;
  /** Commits the removal; resolves false when no row matched. */
  remove: () => Promise<boolean>;
  /** Settle the account even when `remove` matched nothing (a lost compare-and-swap). */
  settleOnMiss?: boolean;
  /** Runs last in the settle step, told whether the removal matched. */
  afterSettle?: (removed: boolean) => Promise<void>;
}): Promise<
  | { removed: false; reason: 'revocation-failed' | 'remove-failed'; error: unknown }
  | { removed: false; reason: 'no-match'; accountEmptied: boolean }
  | { removed: true; accountEmptied: boolean }
> {
  let mapIds: string[];
  try {
    mapIds = await runners.runBeforeCharacterUnlink({ userId, characterId });
  } catch (error) {
    // The runner restores its own partial revocation before it throws.
    return { removed: false, reason: 'revocation-failed', error };
  }

  let removed: boolean;
  try {
    removed = await remove();
  } catch (error) {
    await runners.runAfterFailedCharacterUnlink(characterId);
    return { removed: false, reason: 'remove-failed', error };
  }
  if (!removed) {
    await runners.runAfterFailedCharacterUnlink(characterId);
    if (!settleOnMiss) return { removed: false, reason: 'no-match', accountEmptied: false };
  }

  let accountEmptied = false;
  try {
    if (removed) await runners.runAfterCharacterUnlink({ userId, characterId, mapIds });
  } finally {
    try {
      ({ accountEmptied } = await reconcileAfterCharacterRemoval(userId, characterId, runners));
    } finally {
      await runners.runAfterCharacterLinkChanged({ userId, characterId });
      await afterSettle?.(removed);
    }
  }
  return removed
    ? { removed: true, accountEmptied }
    : { removed: false, reason: 'no-match', accountEmptied };
}
