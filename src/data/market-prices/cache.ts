import { desc } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { cacheLife, cacheTag } from 'next/cache';
import type postgres from 'postgres';
import { db } from '@/db';
import { ADVISORY_LOCK_REFRESH_PRICES } from './constants';
import { refreshPrices, type RefreshSummary } from './ingest';
import { listAllTypeIds, listStaleTypeIds } from './queries';
import { marketPrices } from './schema';

// Accept either the strict default schema (CLI's `drizzle(client)`) or
// the lazy proxy from `@/db` (which infers a wider generic). Refresh
// callers should not have to know which one they're holding.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

// postgres-js's Sql type — the raw client. refreshStalePrices needs it
// directly so it can reserve a connection from the pool for the lifetime
// of the lock.
type Sql = ReturnType<typeof postgres>;

// The lock key fits comfortably in a JS Number (well under 2^53) and
// Postgres bigint accepts numeric literals up to int8 range, so the
// Number() cast is exact and lets postgres-js's tag bind it without
// needing a custom bigint parser configured on the client.
const LOCK_KEY_NUM = Number(ADVISORY_LOCK_REFRESH_PRICES);

export type CachedRefreshResult =
  | { status: 'cached'; lastUpdatedAt: Date | null }
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

// Per-row staleness contract. Identifies which type IDs have
// `stale_after < NOW()` and refreshes only those. Serialized behind a
// Postgres advisory lock so concurrent cron + on-demand callers don't
// double-fetch from the source.
//
// `force: true` widens the set to "every tracked type ID" rather than
// bypassing the lock — used by the cron handler, which runs on its
// own cadence and should always actually refresh.
//
// Session-level lock (`pg_try_advisory_lock`, not `_xact_lock`) on a
// reserved connection. Callers MUST pass a client on the direct
// (unpooled) endpoint: a session-scoped lock only holds if the backend
// session is stable, and Neon's `-pooler` (PgBouncer transaction mode)
// recycles the backend between statements — so the lock would silently
// fail to serialize. With a direct connection the lock held on the
// reserved session blocks other callers' `pg_try_advisory_lock`
// attempts, while the Fuzzwork HTTP call still happens with no
// transaction open (we never pin a long transaction across the network
// round-trip).
//
// `pg_advisory_unlock` is called in `finally` so the connection goes
// back to the pool clean. Without it, the lock would persist on the
// connection and the next caller to receive it would see a held lock.
export async function refreshStalePrices(
  client: Sql,
  options?: { force?: boolean },
): Promise<CachedRefreshResult> {
  const force = options?.force ?? false;
  const db = drizzle(client);

  const reserved = await client.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      const { lastUpdatedAt } = await getPricesFreshness(db);
      return { status: 'cached', lastUpdatedAt };
    }
    lockHeld = true;

    const typeIds = force ? await listAllTypeIds(db) : await listStaleTypeIds(db);

    if (typeIds.length === 0) {
      const { lastUpdatedAt } = await getPricesFreshness(db);
      return { status: 'cached', lastUpdatedAt };
    }

    // HTTP call to Fuzzwork happens here — outside any open transaction
    // and on a connection separate from the one holding the lock. The
    // advisory lock keeps concurrent callers out; refreshPrices' upsert
    // is a single statement, so we never hold a long transaction open
    // across the network round-trip.
    const summary = await refreshPrices(db, typeIds);
    const { lastUpdatedAt } = await getPricesFreshness(db);
    return {
      status: 'refreshed',
      lastUpdatedAt: lastUpdatedAt ?? new Date(),
      summary,
    };
  } finally {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
    reserved.release();
  }
}
