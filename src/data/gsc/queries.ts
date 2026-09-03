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

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function retentionCutoff(retentionDays: number, now: Date): string {
  return toDateStr(new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000));
}

export async function pruneGscSearchAnalytics(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  await database
    .delete(gscSearchAnalytics)
    .where(lt(gscSearchAnalytics.date, retentionCutoff(retentionDays, now)));
}

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

export async function getLastSyncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastSyncedAt: sql<Date | null>`max(${gscSearchAnalytics.syncedAt})` })
    .from(gscSearchAnalytics);
  const raw = row?.lastSyncedAt ?? null;
  return raw === null ? null : new Date(raw as unknown as string);
}
