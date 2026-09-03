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
 * Per-type freshness + provenance marker. The on-view gate reads stale_after
 * (the ESI Expires header — next ~11:05 UTC recompute) to decide fetch-or-serve
 * without touching the bulky daily rows. One row per type.
 */
export const marketHistoryMeta = pgTable('market_history_meta', {
  typeId: integer('type_id').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  staleAfter: timestamp('stale_after', { withTimezone: true }).notNull(),
  source: text('source').notNull(),
});
