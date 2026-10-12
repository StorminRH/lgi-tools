import {
  bigint,
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const marketHistory = pgTable(
  'market_history',
  {
    typeId: integer('type_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    average: doublePrecision('average').notNull(),
    highest: doublePrecision('highest').notNull(),
    lowest: doublePrecision('lowest').notNull(),
    volume: bigint('volume', { mode: 'bigint' }).notNull(),
    orderCount: integer('order_count').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.typeId, t.date] }),
  }),
);

/**
 * Per-type provenance marker: when each type's daily rows were last written
 * and from where, without touching the bulky rows themselves. One row per
 * type. `stale_after` is CCP's expiry as the row was written; the response
 * store, not this column, decides freshness, so it is nullable and can go.
 */
export const marketHistoryMeta = pgTable('market_history_meta', {
  typeId: integer('type_id').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  staleAfter: timestamp('stale_after', { withTimezone: true }),
  source: text('source').notNull(),
});
