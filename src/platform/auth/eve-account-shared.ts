import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { account, characters } from '@/db/auth-schema';

/**
 * Joins a linked account's id to its character profile. Only digit account
 * ids cast, so a foreign id never fails the bigint cast, and the bigint side
 * lets the planner probe the characters primary key.
 */
export function characterProfileJoinOn(accountId: AnyPgColumn, characterId: AnyPgColumn): SQL {
  return sql`${characterId} = CASE WHEN ${accountId} ~ '^[0-9]+$' THEN ${accountId}::bigint END`;
}

export const characterProfileJoin = characterProfileJoinOn(account.accountId, characters.characterId);

export const eveAccountsForUser = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, EVE_PROVIDER_ID));

export function accountMatch(characterId: number) {
  return and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId)));
}

/** The EVE account linking `characterId` to `userId`: the user owns this character. */
export function userAccountMatch(userId: string, characterId: number): SQL | undefined {
  return and(eq(account.userId, userId), accountMatch(characterId));
}

const LINKED_ACCOUNT_ID = /^[0-9]+$/;

export function parseLinkedAccountId(accountId: string): number | null {
  if (!LINKED_ACCOUNT_ID.test(accountId)) return null;
  const characterId = Number(accountId);
  return Number.isSafeInteger(characterId) ? characterId : null;
}

/** Maps each linked-account row to `toValue` in row order, dropping rows whose account id does not parse. */
export function mapLinkedRows<R extends { readonly accountId: string }, T>(
  rows: readonly R[],
  toValue: (characterId: number, row: R) => T,
): T[] {
  return rows.flatMap((row) => {
    const characterId = parseLinkedAccountId(row.accountId);
    return characterId === null ? [] : [toValue(characterId, row)];
  });
}

/** The character ids of linked-account rows in row order, dropping malformed account ids. */
export function linkedCharacterIds(rows: readonly { readonly accountId: string }[]): number[] {
  return mapLinkedRows(rows, (characterId) => characterId);
}
