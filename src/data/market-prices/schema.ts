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
import type { DepthBand } from './types';

// Live market prices keyed by Eve type ID. Region is fixed to Jita
// (10000002) — set in phase 2 (archived — see LGI Tools Document
// Archive/PHASE_2_PLAN.md). No FK to eve_types: this slice operates
// in pure number space and must not depend on the eve-data slice's
// schema being populated first.
//
// Nullable price + volume columns: when a market side has zero orders
// we store NULL so consumers can distinguish "no live price" from a
// real value. updated_at + stale_after are set explicitly on every
// refresh batch; the bulk refresh path filters on stale_after < NOW().

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
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    staleAfter: timestamp('stale_after', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('fuzzwork'),
  },
  (t) => ({
    staleAfterIdx: index('market_prices_stale_after_idx').on(t.staleAfter),
  }),
);
