import { sql } from 'drizzle-orm';
import { bigint, doublePrecision, PgDialect, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, test } from 'vitest';
import { excluded, excludedSet } from './db-upsert';

const listings = pgTable('listings', {
  path: text('path').primaryKey(),
  type: text('type'),
  costIndex: doublePrecision('cost_index'),
  indexed: bigint('indexed', { mode: 'number' }).notNull().default(0),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});

test('excluded names the proposed column by its quoted SQL name and binds nothing', () => {
  const dialect = new PgDialect();

  expect(dialect.sqlToQuery(excluded(listings.costIndex))).toEqual({
    sql: 'excluded."cost_index"',
    params: [],
  });
  expect(dialect.sqlToQuery(excluded(listings.type)).sql).toBe('excluded."type"');
  expect(
    dialect.sqlToQuery(sql`${listings.syncedAt} <= ${excluded(listings.syncedAt)}`).sql,
  ).toBe('"listings"."synced_at" <= excluded."synced_at"');
});

test('excludedSet updates exactly the named columns and leaves the others stored', () => {
  const set = excludedSet(listings, ['type', 'syncedAt']);
  expect(Object.keys(set)).toEqual(['type', 'syncedAt']);

  const upsert = drizzle
    .mock()
    .insert(listings)
    .values({ path: '/sitemap.xml', type: 'sitemap', syncedAt: new Date(0) })
    .onConflictDoUpdate({ target: listings.path, set })
    .toSQL();

  expect(upsert.sql).toContain('"indexed"');
  expect(upsert.sql.slice(upsert.sql.indexOf(' do update set '))).toBe(
    ' do update set "type" = excluded."type", "synced_at" = excluded."synced_at"',
  );
});
