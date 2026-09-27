import { db } from '@/db';
import { getTypeMarketFacts } from '@/data/eve-data/character-facts';
import { getAveragePrices } from '@/data/industry-indices/queries';
import { seedPlaceholderPrices } from '@/data/market-prices/ingest';
import { getPrices } from '@/data/market-prices/queries';
import { jitaMid, jitaSell, type PriceBook, type TypeCategories, type UnitPrices } from '@/features/net-worth/valuation';

export interface ValuationBook {
  prices: PriceBook;
  categories: TypeCategories;
  /** Published, marketable types with no market_prices row yet; seeding them lets the nightly sweep price them. */
  unseeded: number[];
}

/** Stored prices only: one IN query each to market_prices and adjusted_prices, never an ESI call on view. */
export async function resolveValuationBook(typeIds: number[]): Promise<ValuationBook> {
  const [books, averages, facts] = await Promise.all([
    getPrices(typeIds),
    getAveragePrices(typeIds),
    getTypeMarketFacts(typeIds),
  ]);
  const prices = new Map<number, UnitPrices>();
  for (const typeId of typeIds) {
    const book = books.get(typeId);
    const mid = book === undefined ? null : jitaMid(book);
    const sell = book === undefined ? null : jitaSell(book);
    const average = averages.get(typeId) ?? null;
    if (mid !== null || sell !== null || average !== null) prices.set(typeId, { jitaMid: mid, jitaSell: sell, average });
  }
  const categories = new Map<number, number>();
  const unseeded: number[] = [];
  for (const [typeId, fact] of facts) {
    categories.set(typeId, fact.categoryId);
    if (fact.published && fact.marketGroupId !== null && !books.has(typeId)) unseeded.push(typeId);
  }
  return { prices, categories, unseeded: unseeded.sort((a, b) => a - b) };
}

export function seedUnpricedTypes(typeIds: number[]): Promise<number> {
  return seedPlaceholderPrices(db, typeIds);
}
