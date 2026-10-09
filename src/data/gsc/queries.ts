import { and, between, desc, eq, lt, max, sql } from 'drizzle-orm';
import { db } from '@/db';
import { deleteInBatches, type BatchedDeleteResult } from '@/lib/batched-delete';
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

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function retentionCutoff(retentionDays: number, now: Date): string {
  return toDateStr(new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000));
}

export function pruneGscSearchAnalytics(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
  deadline?: number,
): Promise<BatchedDeleteResult> {
  return deleteInBatches(
    database,
    gscSearchAnalytics,
    lt(gscSearchAnalytics.date, retentionCutoff(retentionDays, now)),
    deadline,
  );
}

export function pruneGscUrlInspections(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
  deadline?: number,
): Promise<BatchedDeleteResult> {
  return deleteInBatches(
    database,
    gscUrlInspection,
    lt(gscUrlInspection.inspectionDate, retentionCutoff(retentionDays, now)),
    deadline,
  );
}

function inRange(range: GscRange) {
  return between(gscSearchAnalytics.date, toDateStr(range.from), toDateStr(range.to));
}

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

export function toSearchTotals(
  row: { clicks: number; impressions: number; position: number } | undefined,
): GscTotals {
  const clicks = Number(row?.clicks ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  return { clicks, impressions, ctr: ctr(clicks, impressions), position: Number(row?.position ?? 0) };
}

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

/**
 * The totals `getSearchTotals` computes in SQL, summed from daily total rows
 * that are already loaded: impression-weighted position, zero without
 * impressions.
 */
export function searchTotalsFromTrend(points: readonly GscDailyPoint[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedSum = 0;
  for (const point of points) {
    clicks += point.clicks;
    impressions += point.impressions;
    weightedSum += point.position * point.impressions;
  }
  return toSearchTotals({ clicks, impressions, position: impressions === 0 ? 0 : weightedSum / impressions });
}

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

export function getTopQueries(range: GscRange, limit = 10): Promise<GscTermStat[]> {
  return getTopTerms(range, 'query', limit);
}

export function getTopGscPages(range: GscRange, limit = 10): Promise<GscTermStat[]> {
  return getTopTerms(range, 'page', limit);
}

export async function getSitemapStatus(): Promise<GscSitemapStatus[]> {
  const rows = await db
    .select({
      path: gscSitemaps.path,
      lastDownloaded: gscSitemaps.lastDownloaded,
      isPending: gscSitemaps.isPending,
      warnings: gscSitemaps.warnings,
      errors: gscSitemaps.errors,
      submitted: gscSitemaps.submitted,
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
  }));
}

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
 * Latest stored row for every current sitemap URL. Each URL takes its newest
 * inspection straight from the (url, inspection_date) index instead of
 * reading its whole retained history. The merge keeps never-inspected and
 * repeatedly-failing URLs visible.
 */
export async function getLatestUrlCoverage(sitemapUrls: string[]): Promise<GscUrlStatus[]> {
  if (sitemapUrls.length === 0) return [];
  const latest = db
    .select({
      inspectionDate: gscUrlInspection.inspectionDate,
      url: gscUrlInspection.url,
      verdict: gscUrlInspection.verdict,
      coverageState: gscUrlInspection.coverageState,
      lastCrawlTime: gscUrlInspection.lastCrawlTime,
    })
    .from(gscUrlInspection)
    .where(eq(gscUrlInspection.url, sql`u.val`))
    .orderBy(desc(gscUrlInspection.inspectionDate))
    .limit(1)
    .as('latest');
  const rows = await db
    .select({
      inspectionDate: latest.inspectionDate,
      url: latest.url,
      verdict: latest.verdict,
      coverageState: latest.coverageState,
      lastCrawlTime: latest.lastCrawlTime,
    })
    .from(sql`unnest(${sql.param(sitemapUrls)}::text[]) as u(val)`)
    .crossJoinLateral(latest);
  return mergeCurrentUrlCoverage(sitemapUrls, rows);
}

export async function getCoverageTrend(range: GscRange): Promise<GscCoverageDailyPoint[]> {
  const indexed = sql<number>`count(*) filter (
    where ${gscUrlInspection.verdict} = 'PASS'
  )`.mapWith(Number);
  const notIndexed = sql<number>`count(*) filter (
    where ${gscUrlInspection.verdict} in ('FAIL', 'NEUTRAL')
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
 * A sync stamps every row it writes with one time and upserts its whole
 * window, date-only total rows first, so the newest total row carries the
 * newest sync. Reading only those rows stays on the (dimension, date) index.
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastSyncedAt: max(gscSearchAnalytics.syncedAt) })
    .from(gscSearchAnalytics)
    .where(eq(gscSearchAnalytics.dimension, 'total'));
  return row?.lastSyncedAt ?? null;
}

/** Most recent finalized Google reporting day, distinct from ingestion time. */
export async function getLatestReportDate(): Promise<string | null> {
  const [row] = await db
    .select({ day: sql<string | null>`max(${gscSearchAnalytics.date})` })
    .from(gscSearchAnalytics)
    .where(eq(gscSearchAnalytics.dimension, 'total'));
  return row?.day ?? null;
}
