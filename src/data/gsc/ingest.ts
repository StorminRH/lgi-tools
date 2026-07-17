import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import type { AnyPgDb } from '@/lib/db-types';
import {
  GSC_INSPECTION_BATCH_SIZE,
  GSC_INSPECTION_URL_LIMIT,
  GSC_WINDOW_DAYS,
  UPSERT_CHUNK_ROWS,
  isGscConfigured,
} from './constants';
import { gscSearchAnalytics, gscSitemaps, gscUrlInspection } from './schema';
import { inspectUrl, listSitemaps, querySearchAnalytics, siteUrl } from './source';
import type {
  GscDimension,
  GscSyncSummary,
  IndexStatusApiResult,
  SearchAnalyticsApiRow,
  SitemapApiEntry,
} from './types';

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

/**
 * keys[0] is always the date; for 'query'/'page' keys[1] is the term/url, and
 * 'total' rows (dimensions=['date']) carry no second key, so key=''. Rows with
 * no date key are dropped (the API never omits it, but stay defensive).
 */
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
  status: IndexStatusApiResult | null,
  syncedAt: Date,
  sitemapUrlCount: number,
  inspectionDate = dateStr(syncedAt),
): UrlInspectionRecord {
  return {
    inspectionDate,
    url,
    sitemapUrlCount,
    verdict: status?.verdict ?? null,
    coverageState: status?.coverageState ?? null,
    robotsTxtState: status?.robotsTxtState ?? null,
    indexingState: status?.indexingState ?? null,
    pageFetchState: status?.pageFetchState ?? null,
    lastCrawlTime: parseTimestamp(status?.lastCrawlTime),
    googleCanonical: status?.googleCanonical ?? null,
    userCanonical: status?.userCanonical ?? null,
    crawledAs: status?.crawledAs ?? null,
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

function matchesProperty(url: URL, property: string): boolean {
  if (property.startsWith('sc-domain:')) {
    const domain = property.slice('sc-domain:'.length).toLowerCase();
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
  }
  const prefix = new URL(property);
  return url.href.startsWith(prefix.href);
}

/**
 * Validate the cron-provided sitemap at the data boundary. The normalized,
 * deterministic ordering makes repeated runs and tests stable.
 */
export function prepareInspectionUrls(urls: string[], property: string): string[] {
  const normalized = new Set<string>();
  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`invalid sitemap URL: ${raw}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error(`invalid sitemap URL: ${raw}`);
    }
    if (parsed.hash) throw new Error(`sitemap URL must not contain a fragment: ${raw}`);
    if (!matchesProperty(parsed, property)) {
      throw new Error(`sitemap URL does not belong to GSC property ${property}: ${raw}`);
    }
    normalized.add(parsed.href);
  }
  const prepared = [...normalized].sort((a, b) => a.localeCompare(b));
  if (prepared.length > GSC_INSPECTION_URL_LIMIT) {
    throw new Error(
      `sitemap URL count ${prepared.length} exceeds safe limit ${GSC_INSPECTION_URL_LIMIT}`,
    );
  }
  return prepared;
}

export function missingInspectionUrls(urls: string[], storedUrls: Iterable<string>): string[] {
  const completed = new Set(storedUrls);
  return urls.filter((url) => !completed.has(url));
}

type InspectionBatchResult = { records: UrlInspectionRecord[]; errors: string[] };

export async function upsertUrlInspectionRecords(
  db: AnyPgDb,
  records: UrlInspectionRecord[],
): Promise<void> {
  if (records.length === 0) return;
  await db
    .insert(gscUrlInspection)
    .values(records)
    .onConflictDoUpdate({
      target: [gscUrlInspection.inspectionDate, gscUrlInspection.url],
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
        sitemapUrlCount: excluded('sitemap_url_count'),
        syncedAt: excluded('synced_at'),
      },
    });
}

/**
 * Groups are sequential while the five inspections inside each group run in
 * parallel. A successful response with no indexStatusResult still becomes an
 * all-null row; only request failures remain absent and retryable.
 */
export async function inspectUrlsInBatches(
  urls: string[],
  syncedAt: Date,
  sitemapUrlCount: number,
  inspect: (url: string) => Promise<IndexStatusApiResult | null> = inspectUrl,
): Promise<InspectionBatchResult> {
  const records: UrlInspectionRecord[] = [];
  const errors: string[] = [];
  for (const group of chunk(urls, GSC_INSPECTION_BATCH_SIZE)) {
    const results = await Promise.all(
      group.map(async (url): Promise<
        { ok: true; record: UrlInspectionRecord } | { ok: false; error: string }
      > => {
        try {
          return {
            ok: true,
            record: indexStatusToRecord(url, await inspect(url), syncedAt, sitemapUrlCount),
          };
        } catch (err) {
          return { ok: false, error: `url-inspection ${url}: ${errText(err)}` };
        }
      }),
    );
    for (const result of results) {
      if (result.ok) records.push(result.record);
      else errors.push(result.error);
    }
  }
  return { records, errors };
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

// One pull-and-store surface's outcome: rows landed plus an optional error
// string. Surfaces are isolated so a failure records the error and leaves the
// prior snapshot intact (degrade-to-last-known, like the price path).
type SurfaceResult = { count: number; error: string | null };

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function syncSearchAnalytics(
  db: AnyPgDb,
  startDate: string,
  endDate: string,
  syncedAt: Date,
): Promise<SurfaceResult> {
  try {
    // The pulls are independent (same window, different dimensions), so fetch
    // them concurrently — trivially within the per-site QPM budget, and it cuts
    // the search-analytics leg's latency ~3x.
    const perPull = await Promise.all(
      SEARCH_PULLS.map(async (pull) =>
        searchRowsToRecords(
          await querySearchAnalytics({ startDate, endDate, dimensions: pull.apiDimensions }),
          pull.storage,
          syncedAt,
        ),
      ),
    );
    const records = perPull.flat();
    await upsertSearchAnalytics(db, records);
    return { count: records.length, error: null };
  } catch (err) {
    return { count: 0, error: `search-analytics: ${errText(err)}` };
  }
}

async function syncSitemaps(db: AnyPgDb, syncedAt: Date): Promise<SurfaceResult> {
  try {
    const entries = await listSitemaps();
    if (entries.length === 0) return { count: 0, error: null };
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
    return { count: rows.length, error: null };
  } catch (err) {
    return { count: 0, error: `sitemaps: ${errText(err)}` };
  }
}

// Per-URL, so one bad URL can't sink the batch — each gets its own try/catch.
async function syncUrlInspections(
  db: AnyPgDb,
  syncedAt: Date,
  sitemapUrls: string[],
): Promise<{ count: number; errors: string[] }> {
  try {
    const urls = prepareInspectionUrls(sitemapUrls, siteUrl());
    const inspectionDate = dateStr(syncedAt);
    const stored = await db
      .select({ url: gscUrlInspection.url })
      .from(gscUrlInspection)
      .where(eq(gscUrlInspection.inspectionDate, inspectionDate));
    const missing = missingInspectionUrls(
      urls,
      stored.map((row) => row.url),
    );
    const result = await inspectUrlsInBatches(missing, syncedAt, urls.length);

    await upsertUrlInspectionRecords(db, result.records);
    return { count: result.records.length, errors: result.errors };
  } catch (err) {
    return { count: 0, errors: [`url-inspection: ${errText(err)}`] };
  }
}

/**
 * Pull-and-store across all three Search Console surfaces. Each surface degrades
 * to its last-known snapshot on failure; the summary threads into cron
 * observability.
 */
export async function syncGsc(client: Sql, sitemapUrls: string[]): Promise<GscSyncSummary> {
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

  const search = await syncSearchAnalytics(db, startDate, endDate, syncedAt);
  const sitemap = await syncSitemaps(db, syncedAt);
  const urls = await syncUrlInspections(db, syncedAt, sitemapUrls);

  const errors = [search.error, sitemap.error, ...urls.errors].filter(
    (e): e is string => e !== null,
  );
  const searchRows = search.count;
  const sitemaps = sitemap.count;
  const urlsInspected = urls.count;

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
