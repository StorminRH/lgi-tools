import type { SQL } from 'drizzle-orm';
import { alias, PgDialect } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { account, characters } from '@/db/auth-schema';
import {
  characterProfileJoin,
  characterProfileJoinOn,
  linkedCharacterIds,
  mapLinkedRows,
  parseLinkedAccountId,
  userAccountMatch,
} from './eve-account-shared';

const dialect = new PgDialect();

function render(condition: SQL | undefined) {
  if (condition === undefined) throw new Error('expected a condition');
  const { sql, params } = dialect.sqlToQuery(condition);
  return { sql, params };
}

test('userAccountMatch matches the EVE account for this character on this user, testing the provider once', () => {
  expect(render(userAccountMatch('user-1', 90000011))).toEqual({
    sql: '("account"."user_id" = $1 and ("account"."provider_id" = $2 and "account"."account_id" = $3))',
    params: ['user-1', 'eve', '90000011'],
  });
});

test('characterProfileJoinOn casts only digit account ids, qualified by table or alias', () => {
  expect(render(characterProfileJoin)).toEqual({
    sql: `"characters"."character_id" = CASE WHEN "account"."account_id" ~ '^[0-9]+$' THEN "account"."account_id"::bigint END`,
    params: [],
  });

  const linkedAccount = alias(account, 'searched_eve_account');
  const linkedCharacter = alias(characters, 'searched_character');
  expect(render(characterProfileJoinOn(linkedAccount.accountId, linkedCharacter.characterId))).toEqual({
    sql: `"searched_character"."character_id" = CASE WHEN "searched_eve_account"."account_id" ~ '^[0-9]+$' THEN "searched_eve_account"."account_id"::bigint END`,
    params: [],
  });
});

test('parseLinkedAccountId keeps digit character ids and drops values the SQL bigint join rejects', () => {
  expect(parseLinkedAccountId('90000011')).toBe(90000011);
  expect(parseLinkedAccountId('not-a-number')).toBeNull();
  expect(parseLinkedAccountId('')).toBeNull();
  expect(parseLinkedAccountId('1e5')).toBeNull();
  expect(parseLinkedAccountId('90000011.5')).toBeNull();
  expect(parseLinkedAccountId(' 12 ')).toBeNull();
  expect(parseLinkedAccountId('9007199254740993')).toBeNull();
});

test('linkedCharacterIds and mapLinkedRows keep row order and drop the account ids Number() would coerce', () => {
  const rows = [
    { accountId: '90000013', name: 'Third' },
    { accountId: '', name: 'Empty' },
    { accountId: ' 12 ', name: 'Padded' },
    { accountId: '1e3', name: 'Exponent' },
    { accountId: 'not-a-number', name: 'Foreign' },
    { accountId: '9007199254740993', name: 'Unsafe' },
    { accountId: '90000011', name: 'First' },
  ];

  expect(linkedCharacterIds(rows)).toEqual([90000013, 90000011]);
  expect(mapLinkedRows(rows, (characterId, row) => `${row.name}:${characterId}`)).toEqual([
    'Third:90000013',
    'First:90000011',
  ]);
});
