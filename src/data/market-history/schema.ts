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

// Per-type daily market history for The Forge (3.5.3a) — the inputs the 3.5.3b
// Market Score's demand/price-stability signals read. Global, slow data (CCP
// recomputes once daily): Neon-side, refreshed on view, NOT in Convex
// (placement-by-temperature). Pure number space — no FK to eve-data, keyed by
// raw CCP type IDs, the same decoupling as market_prices / industry_indices.

/**
 * One row per (type, day). `date` is stored in string mode ("YYYY-MM-DD") to
 * match ESI's day key exactly with no timezone ambiguity. A day with no trades
 * has no row, so a calendar gap means "zero demand that day".
 */
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
    // The composite PK's leading type_id column also serves the batch
    // "history for types […]" read, so no separate index is needed.
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
