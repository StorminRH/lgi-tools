import { count, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { cacheLife, cacheTag } from 'next/cache';
import { db, type Sql } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { refreshPrices, type RefreshSummary } from './ingest';
import { listStaleTypeIds } from './queries';
import { marketPrices } from './schema';
import type { AnyPgDb } from '@/lib/db-types';

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

export const PRICES_FRESHNESS_TAG = 'market-prices-freshness';

export async function getCachedPricesFreshness(): Promise<{ lastUpdatedAt: Date | null }> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
  return withColdStartRetry(() => getPricesFreshness(db));
}

export async function getCachedTrackedTypeCount(): Promise<number> {
  'use cache';
  cacheLife('max');
  return withColdStartRetry(async () => {
    const [row] = await db.select({ n: count() }).from(marketPrices);
    return Number(row?.n ?? 0);
  });
}

export async function refreshStalePrices(client: Sql): Promise<CachedRefreshResult> {
  const db = drizzle(client);

  const typeIds = await listStaleTypeIds(db);
  if (typeIds.length === 0) {
    const { lastUpdatedAt } = await getPricesFreshness(db);
    return { status: 'cached', reason: 'empty-set', lastUpdatedAt };
  }

  const summary = await refreshPrices(db, typeIds);
  const { lastUpdatedAt } = await getPricesFreshness(db);
  return {
    status: 'refreshed',
    lastUpdatedAt: lastUpdatedAt ?? new Date(),
    summary,
  };
}
