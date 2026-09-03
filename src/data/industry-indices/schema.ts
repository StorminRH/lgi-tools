import {
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

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

export const adjustedPrices = pgTable('adjusted_prices', {
  typeId: integer('type_id').primaryKey(),
  adjustedPrice: doublePrecision('adjusted_price'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
