import { eq } from 'drizzle-orm';
import { chunk } from '@/lib/array';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { excludedSet } from '@/lib/db-upsert';
import { errorMessage } from '@/lib/failure';
import { daysBefore, isoDay } from '@/lib/iso-date';
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

export type SearchAnalyticsRecord = typeof gscSearchAnalytics.$inferInsert;
export type SitemapRecord = typeof gscSitemaps.$inferInsert;
export type UrlInspectionRecord = typeof gscUrlInspection.$inferInsert;

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
  for (const c of entry.contents ?? []) {
    submitted += coerceCount(c.submitted);
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
    syncedAt,
  };
}

export function indexStatusToRecord(
  url: string,
  status: IndexStatusApiResult | null,
  syncedAt: Date,
  sitemapUrlCount: number,
  inspectionDate = isoDay(syncedAt),
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

function matchesProperty(url: URL, property: string): boolean {
  if (property.startsWith('sc-domain:')) {
    const domain = property.slice('sc-domain:'.length).toLowerCase();
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
  }
  const prefix = new URL(property);
  return url.href.startsWith(prefix.href);
}

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

export type InspectionBatchResult = { records: UrlInspectionRecord[]; errors: string[] };

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
      set: excludedSet(gscUrlInspection, [
        'verdict',
        'coverageState',
        'robotsTxtState',
        'indexingState',
        'pageFetchState',
        'lastCrawlTime',
        'googleCanonical',
        'userCanonical',
        'crawledAs',
        'sitemapUrlCount',
        'syncedAt',
      ]),
    });
}

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
          return { ok: false, error: `url-inspection ${url}: ${errorMessage(err)}` };
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
        set: excludedSet(gscSearchAnalytics, ['clicks', 'impressions', 'position', 'syncedAt']),
      });
  }
}

type SurfaceResult = { count: number; error: string | null };

async function syncSearchAnalytics(
  db: AnyPgDb,
  startDate: string,
  endDate: string,
  syncedAt: Date,
): Promise<SurfaceResult> {
  try {
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
    return { count: 0, error: `search-analytics: ${errorMessage(err)}` };
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
        // `indexed` is left out on purpose: sitemapToRecord never writes it, so
        // copying it from the proposed row would reset it to its default.
        set: excludedSet(gscSitemaps, [
          'lastSubmitted',
          'lastDownloaded',
          'isPending',
          'isSitemapsIndex',
          'type',
          'warnings',
          'errors',
          'submitted',
          'syncedAt',
        ]),
      });
    return { count: rows.length, error: null };
  } catch (err) {
    return { count: 0, error: `sitemaps: ${errorMessage(err)}` };
  }
}

async function syncUrlInspections(
  db: AnyPgDb,
  syncedAt: Date,
  sitemapUrls: string[],
): Promise<{ count: number; errors: string[] }> {
  try {
    const urls = prepareInspectionUrls(sitemapUrls, siteUrl());
    const inspectionDate = isoDay(syncedAt);
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
    return { count: 0, errors: [`url-inspection: ${errorMessage(err)}`] };
  }
}

export async function syncGsc(database: PostgresJsDb, sitemapUrls: string[]): Promise<GscSyncSummary> {
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

  const syncedAt = new Date();
  const endDate = isoDay(syncedAt);
  const startDate = isoDay(daysBefore(syncedAt, GSC_WINDOW_DAYS));

  const search = await syncSearchAnalytics(database, startDate, endDate, syncedAt);
  const sitemap = await syncSitemaps(database, syncedAt);
  const urls = await syncUrlInspections(database, syncedAt, sitemapUrls);

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
