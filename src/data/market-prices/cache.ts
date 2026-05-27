import { desc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ADVISORY_LOCK_REFRESH_PRICES } from './constants';
import { refreshPrices, type RefreshSummary } from './ingest';
import { listAllTypeIds, listStaleTypeIds } from './queries';
import { marketPrices } from './schema';

// Accept either the strict default schema (CLI's `drizzle(client)`) or
// the lazy proxy from `@/db` (which infers a wider generic). Refresh
// callers should not have to know which one they're holding.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

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

// Per-row staleness contract. Identifies which type IDs have
// `stale_after < NOW()` and refreshes only those. Serialized behind a
// Postgres advisory lock so concurrent cron + on-demand callers don't
// double-fetch from the source.
//
// `force: true` widens the set to "every tracked type ID" rather than
// bypassing the lock — used by the cron handler, which runs on its
// own cadence and should always actually refresh.
//
// `pg_try_advisory_xact_lock` over the session-level variant because
// the transaction boundary auto-releases on commit *and* on error,
// so there is no finally { unlock } to forget. Trade-off: the
// transaction stays open during the source HTTP call (~2-5s for the
// current 69-type Fuzzwork batch). If 3.0.3's ESI region dump pushes
// the in-flight duration past ~10s we'll switch to session-level
// `pg_try_advisory_lock` with a reserved connection.
export async function refreshStalePrices(
  db: AnyPgDb,
  options?: { force?: boolean },
): Promise<CachedRefreshResult> {
  const force = options?.force ?? false;

  return db.transaction(async (tx) => {
    const [{ got }] = await tx.execute<{ got: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_REFRESH_PRICES}) AS got
    `);
    if (!got) {
      const { lastUpdatedAt } = await getPricesFreshness(tx);
      return { status: 'cached', lastUpdatedAt };
    }

    const typeIds = force
      ? await listAllTypeIds(tx)
      : await listStaleTypeIds(tx);

    if (typeIds.length === 0) {
      const { lastUpdatedAt } = await getPricesFreshness(tx);
      return { status: 'cached', lastUpdatedAt };
    }

    const summary = await refreshPrices(tx, typeIds);
    const { lastUpdatedAt } = await getPricesFreshness(tx);
    return {
      status: 'refreshed',
      lastUpdatedAt: lastUpdatedAt ?? new Date(),
      summary,
    };
  });
}
