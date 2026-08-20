import { and, eq, sql } from 'drizzle-orm';
import { EVE_PROVIDER_ID } from './eve-sso';
import { account, characters } from '@/db/auth-schema';

// account_id is TEXT; characters.character_id is bigint. Cast only a digit
// string so a malformed EVE account row cannot abort the join.
/** @internal */
export const characterProfileJoin = eq(
  characters.characterId,
  sql`CASE WHEN ${account.accountId} ~ '^[0-9]+$' THEN ${account.accountId}::bigint END`,
);

/** @internal */
export const eveAccountsForUser = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, EVE_PROVIDER_ID));

/** @internal */
export function accountMatch(characterId: number) {
  return and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId)));
}

const LINKED_ACCOUNT_ID = /^[0-9]+$/;

/** @internal */
export function parseLinkedAccountId(accountId: string): number | null {
  if (!LINKED_ACCOUNT_ID.test(accountId)) return null;
  const characterId = Number(accountId);
  return Number.isSafeInteger(characterId) ? characterId : null;
}
