import { desc } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { cacheLife, cacheTag } from 'next/cache';
import type postgres from 'postgres';
import { db } from '@/db';
import { refreshPrices, type RefreshSummary } from './ingest';
import { listStaleTypeIds } from './queries';
import { marketPrices } from './schema';

// Accept either driver: the sweep path passes a postgres-js `drizzle(client)`,
// while `getCachedPricesFreshness` passes the request-path `@/db` proxy (now
// neon-http). Both extend Drizzle's `PgDatabase`; these helpers use only the
// shared query-builder surface (no interactive `.transaction`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<any, any, any>;

// postgres-js's Sql type — the raw client. refreshStalePrices takes it
// directly and wraps it in `drizzle(client)`; the cron and the manual CLI
// both hold a postgres-js client.
type Sql = ReturnType<typeof postgres>;

// `reason` records the one no-write outcome so the cron can tell a healthy
// "nothing was stale" run apart from a real refresh in the record (O-3).
export type CachedRefreshResult =
  | { status: 'cached'; reason: 'empty-set'; lastUpdatedAt: Date | null }
  | { status: 'refreshed'; lastUpdatedAt: Date; summary: RefreshSummary };

// Reads the most recent updated_at. Returns null when the table is empty
// — no batch has ever been written. Exported so the page can render
// initial freshness without triggering a refresh.
export async function getPricesFreshness(
  db: AnyPgDb,
): Promise<{ lastUpdatedAt: Date | null }> {
  const [row] = await db
    .select({ updatedAt: marketPrices.updatedAt })
    .from(marketPrices)
    .orderBy(desc(marketPrices.updatedAt))
    .limit(1);
  return { lastUpdatedAt: row?.updatedAt ?? null };
}

// Revalidation tag for the cached freshness snapshot below. The hourly prices
// cron busts it (`revalidateTag`) the moment a refresh writes new rows.
export const PRICES_FRESHNESS_TAG = 'market-prices-freshness';

// Cached, no-arg view of the latest price timestamp for the header chip. Caching
// the DB read off the render path keeps it in the static shell (the raw
// `getPricesFreshness(db)` takes a non-serializable client and is reused inside
// the refresh write-loop, so it can't carry the directive itself). Cron cadence
// is hourly, so `'hours'` revalidate matches reality, with the tag for an
// immediate bump on each refresh.
export async function getCachedPricesFreshness(): Promise<{ lastUpdatedAt: Date | null }> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
  return getPricesFreshness(db);
}

// Nightly backstop sweep (vercel.json "30 11 * * *"). Refreshes only the
// type IDs with `stale_after < NOW()` — the rows the on-demand view path
// hasn't refreshed within the TTL window. Lock-free: the cron is the only
// bulk writer, and a race with a concurrent on-demand write is last-write-
// wins — both paths persist freshly-fetched rows, so whichever lands second
// simply wins and both values are fresh.
//
// The Fuzzwork/ESI HTTP call inside `refreshPrices` happens with no
// transaction open; its upsert is a single statement, so we never pin a long
// transaction across the network round-trip.
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
