import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import { GSC_WINDOW_DAYS, UPSERT_CHUNK_ROWS, isGscConfigured } from './constants';
import { gscSearchAnalytics, gscSitemaps, gscUrlInspection } from './schema';
import { inspectUrl, inspectionUrls, listSitemaps, querySearchAnalytics } from './source';
import type {
  GscDimension,
  GscSyncSummary,
  IndexStatusApiResult,
  SearchAnalyticsApiRow,
  SitemapApiEntry,
} from './types';

// Accept either driver, like market-prices. The cron wraps its raw postgres-js
// client in `drizzle(client)`; these upserts use only the shared query-builder
// surface (no interactive transaction).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<any, any, any>;
type Sql = ReturnType<typeof postgres>;

// EXCLUDED is the proposed-but-conflicted row inside ON CONFLICT.
function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// ── Pure transforms (API row → DB row) — the unit-tested core ────────────

type SearchAnalyticsRecord = typeof gscSearchAnalytics.$inferInsert;
type SitemapRecord = typeof gscSitemaps.$inferInsert;
type UrlInspectionRecord = typeof gscUrlInspection.$inferInsert;

// int64 counts arrive as JSON strings; coerce defensively to a number.
function coerceCount(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseTimestamp(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// keys[0] is always the date; for 'query'/'page' keys[1] is the term/url, and
// 'total' rows (dimensions=['date']) carry no second key, so key=''. Rows with
// no date key are dropped (the API never omits it, but stay defensive).
export function searchRowsToRecords(
  apiRows: SearchAnalyticsApiRow[],
  dimension: GscDimension,
  syncedAt: Date,
): SearchAnalyticsRecord[] {
  const records: SearchAnalyticsRecord[] = [];
  for (const row of apiRows) {
    const date = row.keys?.[0];
    if (!date) continue;
    records.push({
      date,
      dimension,
      key: dimension === 'total' ? '' : (row.keys?.[1] ?? ''),
      clicks: Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      position: row.position,
      syncedAt,
    });
  }
  return records;
}

export function sitemapToRecord(entry: SitemapApiEntry, syncedAt: Date): SitemapRecord {
  let submitted = 0;
  let indexed = 0;
  for (const c of entry.contents ?? []) {
    submitted += coerceCount(c.submitted);
    indexed += coerceCount(c.indexed);
  }
  return {
    path: entry.path,
    lastSubmitted: parseTimestamp(entry.lastSubmitted),
    lastDownloaded: parseTimestamp(entry.lastDownloaded),
    isPending: entry.isPending ?? false,
    isSitemapsIndex: entry.isSitemapsIndex ?? false,
    type: entry.type ?? null,
    warnings: coerceCount(entry.warnings),
    errors: coerceCount(entry.errors),
    submitted,
    indexed,
    syncedAt,
  };
}

export function indexStatusToRecord(
  url: string,
  status: IndexStatusApiResult,
  syncedAt: Date,
): UrlInspectionRecord {
  return {
    url,
    verdict: status.verdict ?? null,
    coverageState: status.coverageState ?? null,
    robotsTxtState: status.robotsTxtState ?? null,
    indexingState: status.indexingState ?? null,
    pageFetchState: status.pageFetchState ?? null,
    lastCrawlTime: parseTimestamp(status.lastCrawlTime),
    googleCanonical: status.googleCanonical ?? null,
    userCanonical: status.userCanonical ?? null,
    crawledAs: status.crawledAs ?? null,
    syncedAt,
  };
}

// ── Sync orchestrator ───────────────────────────────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// dimensions=['date'] → daily site totals; ['date','query'|'page'] → per-day
// breakdowns. Stored under the corresponding GscDimension tag.
const SEARCH_PULLS: { storage: GscDimension; apiDimensions: string[] }[] = [
  { storage: 'total', apiDimensions: ['date'] },
  { storage: 'query', apiDimensions: ['date', 'query'] },
  { storage: 'page', apiDimensions: ['date', 'page'] },
];

async function upsertSearchAnalytics(
  db: AnyPgDb,
  records: SearchAnalyticsRecord[],
): Promise<void> {
  for (const batch of chunk(records, UPSERT_CHUNK_ROWS)) {
    await db
      .insert(gscSearchAnalytics)
      .values(batch)
      .onConflictDoUpdate({
        target: [gscSearchAnalytics.date, gscSearchAnalytics.dimension, gscSearchAnalytics.key],
        set: {
          clicks: excluded('clicks'),
          impressions: excluded('impressions'),
          position: excluded('position'),
          syncedAt: excluded('synced_at'),
        },
      });
  }
}

// Pull-and-store. Each surface is isolated in a try/catch: a failure records
// the error and leaves the prior snapshot intact (degrade-to-last-known, like
// the price path) rather than breaking the dashboard. Returns a summary the
// cron threads into observability.
export async function syncGsc(client: Sql): Promise<GscSyncSummary> {
  const start = Date.now();
  if (!isGscConfigured()) {
    return {
      status: 'skipped',
      reason: 'not_configured',
      searchRows: 0,
      sitemaps: 0,
      urlsInspected: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  const db = drizzle(client);
  const syncedAt = new Date();
  const endDate = dateStr(syncedAt);
  const startDate = dateStr(new Date(syncedAt.getTime() - GSC_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const errors: string[] = [];
  let searchRows = 0;
  let sitemaps = 0;
  let urlsInspected = 0;

  try {
    const records: SearchAnalyticsRecord[] = [];
    for (const pull of SEARCH_PULLS) {
      const apiRows = await querySearchAnalytics({
        startDate,
        endDate,
        dimensions: pull.apiDimensions,
      });
      records.push(...searchRowsToRecords(apiRows, pull.storage, syncedAt));
    }
    await upsertSearchAnalytics(db, records);
    searchRows = records.length;
  } catch (err) {
    errors.push(`search-analytics: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const entries = await listSitemaps();
    if (entries.length > 0) {
      const rows = entries.map((e) => sitemapToRecord(e, syncedAt));
      await db
        .insert(gscSitemaps)
        .values(rows)
        .onConflictDoUpdate({
          target: gscSitemaps.path,
          set: {
            lastSubmitted: excluded('last_submitted'),
            lastDownloaded: excluded('last_downloaded'),
            isPending: excluded('is_pending'),
            isSitemapsIndex: excluded('is_sitemaps_index'),
            type: excluded('type'),
            warnings: excluded('warnings'),
            errors: excluded('errors'),
            submitted: excluded('submitted'),
            indexed: excluded('indexed'),
            syncedAt: excluded('synced_at'),
          },
        });
      sitemaps = rows.length;
    }
  } catch (err) {
    errors.push(`sitemaps: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Per-URL, so one bad URL can't sink the batch.
  for (const url of inspectionUrls()) {
    try {
      const status = await inspectUrl(url);
      if (!status) continue;
      await db
        .insert(gscUrlInspection)
        .values(indexStatusToRecord(url, status, syncedAt))
        .onConflictDoUpdate({
          target: gscUrlInspection.url,
          set: {
            verdict: excluded('verdict'),
            coverageState: excluded('coverage_state'),
            robotsTxtState: excluded('robots_txt_state'),
            indexingState: excluded('indexing_state'),
            pageFetchState: excluded('page_fetch_state'),
            lastCrawlTime: excluded('last_crawl_time'),
            googleCanonical: excluded('google_canonical'),
            userCanonical: excluded('user_canonical'),
            crawledAs: excluded('crawled_as'),
            syncedAt: excluded('synced_at'),
          },
        });
      urlsInspected++;
    } catch (err) {
      errors.push(`url-inspection ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const anyLanded = searchRows + sitemaps + urlsInspected > 0;
  const status: GscSyncSummary['status'] =
    errors.length === 0 ? 'synced' : anyLanded ? 'partial' : 'failed';

  return {
    status,
    reason: status === 'failed' ? errors[0] : undefined,
    searchRows,
    sitemaps,
    urlsInspected,
    errors,
    durationMs: Date.now() - start,
  };
}
