import { and, eq, sql } from 'drizzle-orm';
import { EVE_PROVIDER_ID } from './eve-sso';
import { account, characters } from '@/db/auth-schema';

// Slice-private predicate builders shared by the auth query modules
// (linked-characters, affiliation-store, admin-users, account-purge, and
// owner-transfer).
// One home for the "which account rows are EVE links" decision so the
// provider/key shape can change in exactly one place. Never import these
// outside `src/platform/auth/`.

// account_id is TEXT; characters.character_id is bigint. Cast on the account
// side so the join uses the characters PK. Shared by every account→characters
// join in the auth query modules.
/** @internal */
export const characterProfileJoin = eq(
  characters.characterId,
  sql`${account.accountId}::bigint`,
);

/** @internal */
export const eveAccountsForUser = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, EVE_PROVIDER_ID));

// The account-row predicate for one EVE character — provider + character id (as a
// string). A predicate helper, not a full accountByCharacter query, so each
// caller keeps its own select/from/where/limit chain intact.
/** @internal */
export function accountMatch(characterId: number) {
  return and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId)));
}
