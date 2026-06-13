import {
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Two daily-refreshed CCP datasets that feed industry job-fee math (EIV +
// cost-index). Both operate in pure number space — no FK to eve-data — keyed by
// raw CCP IDs, the same decoupling as market_prices. Written by the daily
// /api/cron/refresh-industry-indices sweep; read by raw system_id / type_id.

// Per-system industry cost indices, LONG form: one row per (system, activity).
// The six activity values are one statistic indexed by a categorical key, so
// long-form maps 1:1 to the consumer's (system, activity) lookup and a new CCP
// activity is new rows, never a migration. `activity` is plain text narrowed to
// the IndustryActivity union at the JS boundary (CCP's vocabulary — the
// market_prices.source pattern, not a pg enum). The composite PK's leading
// solar_system_id column serves the batch "indices for systems […]" lookup, so
// no separate index is needed.
export const industryCostIndices = pgTable(
  'industry_cost_indices',
  {
    solarSystemId: integer('solar_system_id').notNull(),
    activity: text('activity').notNull(),
    costIndex: doublePrecision('cost_index').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.solarSystemId, t.activity] }),
  }),
);

// CCP adjusted prices, keyed by Eve type ID. Stores only adjusted_price (what
// EIV consumes); average_price rides the same endpoint but has no consumer, so
// it's deliberately omitted (a one-line add later, no rewrite). Nullable to
// preserve the absent-vs-0.0 distinction from the ESI response.
export const adjustedPrices = pgTable('adjusted_prices', {
  typeId: integer('type_id').primaryKey(),
  adjustedPrice: doublePrecision('adjusted_price'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
