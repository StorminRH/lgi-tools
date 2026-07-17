import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { DepthBand, RegionalDiscount } from './types';

// Live market prices keyed by Eve type ID. Scope is fixed to the Jita 4-4
// station book (3.7.26.1; The Forge region dump is still the fetch, the
// station is the price). No FK to eve_types: this slice operates
// in pure number space and must not depend on the eve-data slice's
// schema being populated first.
//
// Nullable price + volume columns: when a market side has zero orders
// we store NULL so consumers can distinguish "no live price" from a
// real value. updated_at + stale_after are set explicitly on every
// refresh batch; the bulk refresh path filters on stale_after < NOW().

/**
 * Drizzle schema owner for market prices; migrations, queries, retention, and purge claims derive
 * from this single declaration.
 */
export const marketPrices = pgTable(
  'market_prices',
  {
    typeId: integer('type_id').primaryKey(),
    bestBuy: doublePrecision('best_buy'),
    bestSell: doublePrecision('best_sell'),
    pct5Buy: doublePrecision('pct5_buy'),
    pct5Sell: doublePrecision('pct5_sell'),
    buyVolume: bigint('buy_volume', { mode: 'bigint' }),
    sellVolume: bigint('sell_volume', { mode: 'bigint' }),
    // Near-touch depth ladder per side (3.5.3a): cumulative volume within
    // DEPTH_BANDS_PCT of the best. Nullable — older rows and Fuzzwork-fallback
    // rows carry NULL until the next ESI refresh recomputes them.
    buyDepth: jsonb('buy_depth').$type<DepthBand[]>(),
    sellDepth: jsonb('sell_depth').$type<DepthBand[]>(),
    // Best single non-hub sell opportunity (3.7.26.1). Nullable — no
    // opportunity cleared the gate, the row predates the column, or the row
    // came from the Fuzzwork fallback (no order book), which — like the
    // depth columns above — nulls it on overwrite until the next ESI refresh.
    regionalDiscount: jsonb('regional_discount').$type<RegionalDiscount>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    staleAfter: timestamp('stale_after', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('fuzzwork'),
  },
  (t) => ({
    staleAfterIdx: index('market_prices_stale_after_idx').on(t.staleAfter),
  }),
);
