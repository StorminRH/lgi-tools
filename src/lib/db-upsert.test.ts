import { sql } from 'drizzle-orm';
import { bigint, doublePrecision, PgDialect, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, test } from 'vitest';
import { excluded, excludedSet, proposedRowsWhere } from './db-upsert';

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

test('proposedRowsWhere selects every insertable column from the rows as one jsonb parameter, only where the condition holds', () => {
  const ranked = pgTable('ranked', {
    path: text('path').primaryKey(),
    score: doublePrecision('score'),
    doubled: doublePrecision('doubled').generatedAlwaysAs(sql`score * 2`),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  });
  const syncedAt = new Date('2026-10-12T12:00:00.000Z');

  const insert = drizzle
    .mock()
    .insert(ranked)
    .select(proposedRowsWhere(ranked, [{ path: '/a', score: 1.5, syncedAt }, { path: '/b', syncedAt }], sql`exists (select 1 from "gates" where "open" = ${true})`))
    .toSQL();

  expect(insert.sql).toBe(
    'insert into "ranked" ("path", "score", "synced_at") select proposed."path", proposed."score", proposed."synced_at" ' +
      'from jsonb_populate_recordset(null::"ranked", $1::jsonb) as proposed where exists (select 1 from "gates" where "open" = $2)',
  );
  expect(insert.params).toEqual([
    JSON.stringify([
      { path: '/a', score: 1.5, synced_at: syncedAt.toISOString() },
      { path: '/b', score: null, synced_at: syncedAt.toISOString() },
    ]),
    true,
  ]);
});
