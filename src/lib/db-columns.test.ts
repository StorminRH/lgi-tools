import { and, eq } from 'drizzle-orm';
import { bigint, integer, PgDialect, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, test } from 'vitest';
import { ownerKeyWhere } from './db-columns';

const holderTypeEnum = pgEnum('holder_type', ['character', 'corporation']);
const holdings = pgTable('holdings', {
  id: integer('id').primaryKey(),
  ownerType: holderTypeEnum('owner_type').notNull(),
  ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
  endpoint: text('endpoint').notNull(),
});

test('ownerKeyWhere binds the owner pair as one parenthesised term, alone or inside and()', () => {
  const { sql, params } = new PgDialect().sqlToQuery(
    ownerKeyWhere(holdings, { ownerType: 'corporation', ownerId: 98000001 }),
  );
  expect({ sql, params }).toEqual({
    sql: '("holdings"."owner_type" = $1 and "holdings"."owner_id" = $2)',
    params: ['corporation', 98000001],
  });

  const scopedDelete = drizzle
    .mock()
    .delete(holdings)
    .where(and(
      eq(holdings.id, 7),
      ownerKeyWhere(holdings, { ownerType: 'character', ownerId: 90001 }),
      eq(holdings.endpoint, '/characters/90001/assets/'),
    ))
    .toSQL();

  expect(scopedDelete).toEqual({
    sql: 'delete from "holdings" where ("holdings"."id" = $1 and ("holdings"."owner_type" = $2 and "holdings"."owner_id" = $3) and "holdings"."endpoint" = $4)',
    params: [7, 'character', 90001, '/characters/90001/assets/'],
  });
});
