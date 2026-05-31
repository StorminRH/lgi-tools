import { inArray, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db as defaultDb } from '@/db';
import { marketPrices } from '@/db/schema';
import type { MarketPrice, PriceSource } from './types';

// Accept either the strict default schema (CLI's `drizzle(client)`) or the
// lazy proxy from `@/db` (which infers a wider generic). Same wrinkle as
// cache.ts / ingest.ts — callers shouldn't have to know which one they're
// holding. Helpers that get called from inside a db.transaction take an
// explicit `db` so they run on the transaction connection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

const PRICE_COLUMNS = {
  typeId: marketPrices.typeId,
  bestBuy: marketPrices.bestBuy,
  bestSell: marketPrices.bestSell,
  pct5Buy: marketPrices.pct5Buy,
  pct5Sell: marketPrices.pct5Sell,
  buyVolume: marketPrices.buyVolume,
  sellVolume: marketPrices.sellVolume,
  source: marketPrices.source,
  updatedAt: marketPrices.updatedAt,
  staleAfter: marketPrices.staleAfter,
} as const;

export async function getPrices(
  typeIds: number[],
): Promise<Map<number, MarketPrice>> {
  if (typeIds.length === 0) return new Map();
  const rows = await defaultDb
    .select(PRICE_COLUMNS)
    .from(marketPrices)
    .where(inArray(marketPrices.typeId, typeIds));
  const out = new Map<number, MarketPrice>();
  // `source` is a free `text` column at the DB level; narrow it to the
  // PriceSource union (only the union's literals are ever written).
  for (const r of rows) out.set(r.typeId, { ...r, source: r.source as PriceSource });
  return out;
}

// Every type ID in market_prices, regardless of staleness. Used by the
// `force: true` refresh path to mean "refresh everything" without
// bypassing the advisory lock.
export async function listAllTypeIds(db: AnyPgDb): Promise<number[]> {
  const rows = await db
    .select({ typeId: marketPrices.typeId })
    .from(marketPrices);
  return rows.map((r) => r.typeId);
}

// Type IDs with stale_after < NOW(). Drives the normal-path bulk refresh:
// only the rows that have actually expired get fetched from the source.
export async function listStaleTypeIds(db: AnyPgDb): Promise<number[]> {
  const rows = await db
    .select({ typeId: marketPrices.typeId })
    .from(marketPrices)
    .where(lt(marketPrices.staleAfter, sql`NOW()`));
  return rows.map((r) => r.typeId);
}

// Type IDs from `expected` that have NO row in market_prices. For callers
// that want to ensure their expected set has rows after seeding. Exported
// now so 3.0.3/3.0.4 wiring can read it; no runtime consumer in 3.0.2.
// JS-side set diff after a single IN(...) round trip — at the expected
// scale (~thousands of IDs) cheaper than an `unnest` + LEFT JOIN dance,
// and avoids the drizzle sql-tag array-binding wrinkle.
export async function listMissingTypeIds(
  db: AnyPgDb,
  expected: number[],
): Promise<number[]> {
  if (expected.length === 0) return [];
  const present = await db
    .select({ typeId: marketPrices.typeId })
    .from(marketPrices)
    .where(inArray(marketPrices.typeId, expected));
  const presentSet = new Set(present.map((r) => r.typeId));
  return expected.filter((id) => !presentSet.has(id));
}
