import { and, between, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { gscSearchAnalytics, gscSitemaps, gscUrlInspection } from './schema';
import type {
  GscDailyPoint,
  GscCoverageDailyPoint,
  GscRange,
  GscSitemapStatus,
  GscTermStat,
  GscTotals,
  GscUrlStatus,
} from './types';

// Read-only aggregates over the stored GSC snapshots — the dashboard's only
// data source for the SEO tab (zero Google calls on page load). All search
// figures derive CTR (clicks/impressions) at read time and average position by
// impression weight. Date filtering uses YYYY-MM-DD strings against the `date`
// column (typed `between`, never a raw Date interpolation — drizzle would bind
// a full timestamp Postgres can't compare cleanly to a date).

/**
 * The `date` column is stored as 'YYYY-MM-DD'; convert a range bound to match.
 * Exported for the date-string unit test.
 */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function retentionCutoff(retentionDays: number, now: Date): string {
  return toDateStr(new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000));
}

/** Deletes Search Console analytics rows older than the retention cutoff. */
export async function pruneGscSearchAnalytics(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  await database
    .delete(gscSearchAnalytics)
    .where(lt(gscSearchAnalytics.date, retentionCutoff(retentionDays, now)));
}

/** Deletes URL inspection history older than the retention cutoff while retaining current coverage state. */
export async function pruneGscUrlInspections(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  await database
    .delete(gscUrlInspection)
    .where(lt(gscUrlInspection.inspectionDate, retentionCutoff(retentionDays, now)));
}

function inRange(range: GscRange) {
  return between(gscSearchAnalytics.date, toDateStr(range.from), toDateStr(range.to));
}

// Impression-weighted average position over a grouped set. NOTE: a close proxy
// for GSC's own range aggregation (Google weights slightly differently), so the
// dashboard may show a small delta from the GSC UI — documented for the operator.
const weightedPosition = sql<number>`coalesce(
  sum(${gscSearchAnalytics.position} * ${gscSearchAnalytics.impressions})
    / nullif(sum(${gscSearchAnalytics.impressions}), 0),
  0
)`.mapWith(Number);

const sumClicks = sql<number>`coalesce(sum(${gscSearchAnalytics.clicks}), 0)`.mapWith(Number);
const sumImpressions = sql<number>`coalesce(sum(${gscSearchAnalytics.impressions}), 0)`.mapWith(
  Number,
);

function ctr(clicks: number, impressions: number): number {
  return impressions > 0 ? clicks / impressions : 0;
}

/**
 * Converts raw Search Console metric totals into normalized clicks, impressions, CTR, and average
 * position.
 */
export function toSearchTotals(
  row: { clicks: number; impressions: number; position: number } | undefined,
): GscTotals {
  const clicks = Number(row?.clicks ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  return { clicks, impressions, ctr: ctr(clicks, impressions), position: Number(row?.position ?? 0) };
}

/**
 * Daily site totals for the trend charts — one row per day (each carries GSC's
 * own daily position, so no weighting needed here).
 */
export async function getSearchTrend(range: GscRange): Promise<GscDailyPoint[]> {
  const rows = await db
    .select({
      day: gscSearchAnalytics.date,
      clicks: gscSearchAnalytics.clicks,
      impressions: gscSearchAnalytics.impressions,
      position: gscSearchAnalytics.position,
    })
    .from(gscSearchAnalytics)
    .where(and(eq(gscSearchAnalytics.dimension, 'total'), inRange(range)))
    .orderBy(gscSearchAnalytics.date);
  return rows.map((r) => ({
    day: r.day,
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
    position: Number(r.position),
  }));
}

/** Headline numbers over the range (summed from the daily totals). */
export async function getSearchTotals(range: GscRange): Promise<GscTotals> {
  const [row] = await db
    .select({ clicks: sumClicks, impressions: sumImpressions, position: weightedPosition })
    .from(gscSearchAnalytics)
    .where(and(eq(gscSearchAnalytics.dimension, 'total'), inRange(range)));
  return toSearchTotals(row);
}

async function getTopTerms(
  range: GscRange,
  dimension: 'query' | 'page',
  limit: number,
): Promise<GscTermStat[]> {
  const rows = await db
    .select({
      key: gscSearchAnalytics.key,
      clicks: sumClicks,
      impressions: sumImpressions,
      position: weightedPosition,
    })
    .from(gscSearchAnalytics)
    .where(and(eq(gscSearchAnalytics.dimension, dimension), inRange(range)))
    .groupBy(gscSearchAnalytics.key)
    .orderBy(desc(sumClicks), desc(sumImpressions))
    .limit(limit);
  return rows.map((r) => {
    const clicks = Number(r.clicks);
    const impressions = Number(r.impressions);
    return { key: r.key, clicks, impressions, ctr: ctr(clicks, impressions), position: Number(r.position) };
  });
}

/**
 * Returns the highest-impression Search Console queries and normalized metrics over the requested
 * date range.
 */
export function getTopQueries(range: GscRange, limit = 10): Promise<GscTermStat[]> {
  return getTopTerms(range, 'query', limit);
}

/**
 * Returns the highest-impression Search Console pages and normalized metrics over the requested
 * date range.
 */
export function getTopGscPages(range: GscRange, limit = 10): Promise<GscTermStat[]> {
  return getTopTerms(range, 'page', limit);
}

/** Current sitemap snapshot (not range-bound). */
export async function getSitemapStatus(): Promise<GscSitemapStatus[]> {
  const rows = await db
    .select({
      path: gscSitemaps.path,
      lastDownloaded: gscSitemaps.lastDownloaded,
      isPending: gscSitemaps.isPending,
      warnings: gscSitemaps.warnings,
      errors: gscSitemaps.errors,
      submitted: gscSitemaps.submitted,
      indexed: gscSitemaps.indexed,
    })
    .from(gscSitemaps)
    .orderBy(gscSitemaps.path);
  return rows.map((r) => ({
    path: r.path,
    lastDownloaded: r.lastDownloaded,
    isPending: r.isPending,
    warnings: Number(r.warnings),
    errors: Number(r.errors),
    submitted: Number(r.submitted),
    indexed: Number(r.indexed),
  }));
}

/**
 * Merges the canonical sitemap URL set with latest inspection records so missing inspections
 * remain visible as explicit pending rows.
 */
export function mergeCurrentUrlCoverage(
  sitemapUrls: string[],
  storedRows: GscUrlStatus[],
): GscUrlStatus[] {
  const storedByUrl = new Map(storedRows.map((row) => [row.url, row]));
  return sitemapUrls.map(
    (url) =>
      storedByUrl.get(url) ?? {
        inspectionDate: null,
        url,
        verdict: null,
        coverageState: null,
        lastCrawlTime: null,
      },
  );
}

/**
 * Latest stored row for every current sitemap URL. DISTINCT ON follows
 * PostgreSQL's required key-first ordering, then takes the newest inspection
 * date. The merge keeps never-inspected and repeatedly-failing URLs visible.
 */
export async function getLatestUrlCoverage(sitemapUrls: string[]): Promise<GscUrlStatus[]> {
  if (sitemapUrls.length === 0) return [];
  const rows = await db
    .selectDistinctOn([gscUrlInspection.url], {
      inspectionDate: gscUrlInspection.inspectionDate,
      url: gscUrlInspection.url,
      verdict: gscUrlInspection.verdict,
      coverageState: gscUrlInspection.coverageState,
      lastCrawlTime: gscUrlInspection.lastCrawlTime,
    })
    .from(gscUrlInspection)
    .where(inArray(gscUrlInspection.url, sitemapUrls))
    .orderBy(gscUrlInspection.url, desc(gscUrlInspection.inspectionDate));
  return mergeCurrentUrlCoverage(
    sitemapUrls,
    rows.map((r) => ({
      inspectionDate: r.inspectionDate,
      url: r.url,
      verdict: r.verdict,
      coverageState: r.coverageState,
      lastCrawlTime: r.lastCrawlTime,
    })),
  );
}

/**
 * Daily coverage counts within the selected admin range. Each stored row carries
 * that day's expected sitemap size, so normal sitemap growth never erases older
 * complete days. Partial days stay absent until retries fill the expected count.
 */
export async function getCoverageTrend(range: GscRange): Promise<GscCoverageDailyPoint[]> {
  const indexed = sql<number>`count(*) filter (
    where ${gscUrlInspection.verdict} = 'PASS'
  )`.mapWith(Number);
  const notIndexed = sql<number>`count(*) filter (
    where ${gscUrlInspection.verdict} is distinct from 'PASS'
  )`.mapWith(Number);
  const rows = await db
    .select({ day: gscUrlInspection.inspectionDate, indexed, notIndexed })
    .from(gscUrlInspection)
    .where(between(gscUrlInspection.inspectionDate, toDateStr(range.from), toDateStr(range.to)))
    .groupBy(gscUrlInspection.inspectionDate)
    .having(
      sql`bool_and(${gscUrlInspection.sitemapUrlCount} is not null)
        and count(*) = max(${gscUrlInspection.sitemapUrlCount})`,
    )
    .orderBy(gscUrlInspection.inspectionDate);
  return rows.map((row) => ({
    day: row.day,
    indexed: Number(row.indexed),
    notIndexed: Number(row.notIndexed),
  }));
}

/**
 * Latest sync time across the stored rows — the "data as of" caption (null when
 * nothing has synced yet). The dashboard gates the GSC cards on isGscConfigured()
 * (env-only) before calling this, so it fans this out alongside the data reads.
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastSyncedAt: sql<Date | null>`max(${gscSearchAnalytics.syncedAt})` })
    .from(gscSearchAnalytics);
  // drizzle returns a raw timestamp string for a bare sql<> aggregate (both drivers
  // disable the timestamp parser; only typed columns are re-mapped), so coerce to a
  // real Date here — consumers call .toISOString() on it. A null max (nothing synced)
  // stays null, never the epoch.
  const raw = row?.lastSyncedAt ?? null;
  return raw === null ? null : new Date(raw as unknown as string);
}
