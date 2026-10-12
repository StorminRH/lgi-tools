import { desc } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { refreshPrices, type RefreshSummary } from './ingest';
import { MARKET_PRICES_TAG } from './keys';
import { listStaleTypeIds } from './queries';
import { marketPrices } from './schema';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';

export type CachedRefreshResult =
  | { status: 'cached'; reason: 'empty-set'; lastUpdatedAt: Date | null }
  | { status: 'refreshed'; lastUpdatedAt: Date; summary: RefreshSummary };

async function getPricesFreshness(
  db: AnyPgDb,
): Promise<{ lastUpdatedAt: Date | null }> {
  const [row] = await db
    .select({ updatedAt: marketPrices.updatedAt })
    .from(marketPrices)
    .orderBy(desc(marketPrices.updatedAt))
    .limit(1);
  return { lastUpdatedAt: row?.updatedAt ?? null };
}

/**
 * When any price was last written, cached across instances until a price
 * write clears the tag. It only aggregates stored rows and never refreshes
 * anything, and every price write (the view's write-behind and the cron
 * sweep) clears MARKET_PRICES_TAG, so the entry cannot outlive the rows it
 * reads. Timing it by the earliest stored order book instead would rebuild
 * it on nearly every request: some type's book has almost always expired.
 */
export async function getCachedPricesFreshness(): Promise<{ lastUpdatedAt: Date | null }> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(MARKET_PRICES_TAG);
  return withColdStartRetry(() => getPricesFreshness(db));
}

export async function refreshStalePrices(database: PostgresJsDb): Promise<CachedRefreshResult> {
  const typeIds = await listStaleTypeIds(database);
  if (typeIds.length === 0) {
    const { lastUpdatedAt } = await getPricesFreshness(database);
    return { status: 'cached', reason: 'empty-set', lastUpdatedAt };
  }

  const summary = await refreshPrices(database, typeIds);
  const { lastUpdatedAt } = await getPricesFreshness(database);
  return {
    status: 'refreshed',
    lastUpdatedAt: lastUpdatedAt ?? new Date(),
    summary,
  };
}
