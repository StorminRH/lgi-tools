import { desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { refreshPrices, type RefreshSummary } from './ingest';
import { marketPrices } from './schema';

// Accept either the strict default schema (CLI's `drizzle(client)`) or
// the lazy proxy from `@/db` (which infers a wider generic). Refresh
// callers should not have to know which one they're holding.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CachedRefreshResult =
  | { status: 'cached'; lastUpdatedAt: Date }
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

// Cache-guarded refresh. Source-of-truth for "which type IDs to refresh"
// is the market_prices table itself — the wormhole-sites ingest seeds it
// during `pnpm db:ingest`, and this slice must not import from any
// feature slice. force=true bypasses the freshness check.
export async function refreshKnownPricesIfStale(
  db: AnyPgDb,
  options?: { force?: boolean },
): Promise<CachedRefreshResult> {
  const force = options?.force ?? false;

  const { lastUpdatedAt } = await getPricesFreshness(db);
  if (
    !force &&
    lastUpdatedAt != null &&
    Date.now() - lastUpdatedAt.getTime() < CACHE_TTL_MS
  ) {
    return { status: 'cached', lastUpdatedAt };
  }

  const trackedIds = await db
    .select({ typeId: marketPrices.typeId })
    .from(marketPrices);
  const typeIds = trackedIds.map((r) => r.typeId);

  const summary = await refreshPrices(db, typeIds);

  // Re-read freshness so the caller sees the new MAX(updated_at). If the
  // refresh wrote nothing (typeIds was empty), fall back to "now" so the
  // UI doesn't loop on the empty-table edge case.
  const { lastUpdatedAt: newLastUpdated } = await getPricesFreshness(db);
  return {
    status: 'refreshed',
    lastUpdatedAt: newLastUpdated ?? new Date(),
    summary,
  };
}
