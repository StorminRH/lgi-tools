import { desc } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { storedRouteExpiry, untilExpires } from '@/data/esi-store';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { refreshPrices, type RefreshSummary } from './ingest';
import { MARKET_PRICES_TAG, ORDERS_ROUTE } from './keys';
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
 * When any price was last written, cached across instances until the
 * earliest stored order-book answer expires: the first moment a view may
 * write a newer price. Every price commit clears the tag as well.
 */
export async function getCachedPricesFreshness(): Promise<{ lastUpdatedAt: Date | null }> {
  'use cache: remote';
  cacheTag(MARKET_PRICES_TAG);
  const [freshness, expiresAt] = await Promise.all([
    withColdStartRetry(() => getPricesFreshness(db)),
    storedRouteExpiry(ORDERS_ROUTE),
  ]);
  cacheLife(untilExpires(expiresAt));
  return freshness;
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
