import { and, between, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gscSearchAnalytics, gscSitemaps, gscUrlInspection } from './schema';
import type {
  GscDailyPoint,
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

// The `date` column is stored as 'YYYY-MM-DD'; convert a range bound to match.
// Exported for the date-string unit test.
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
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

// Daily site totals for the trend charts — one row per day (each carries GSC's
// own daily position, so no weighting needed here).
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

// Headline numbers over the range (summed from the daily totals).
export async function getSearchTotals(range: GscRange): Promise<GscTotals> {
  const [row] = await db
    .select({ clicks: sumClicks, impressions: sumImpressions, position: weightedPosition })
    .from(gscSearchAnalytics)
    .where(and(eq(gscSearchAnalytics.dimension, 'total'), inRange(range)));
  const clicks = Number(row?.clicks ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  return { clicks, impressions, ctr: ctr(clicks, impressions), position: Number(row?.position ?? 0) };
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

export function getTopPages(range: GscRange, limit = 10): Promise<GscTermStat[]> {
  return getTopTerms(range, 'page', limit);
}

// Current sitemap snapshot (not range-bound).
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

// Current per-URL inspection snapshot (not range-bound).
export async function getUrlInspection(): Promise<GscUrlStatus[]> {
  const rows = await db
    .select({
      url: gscUrlInspection.url,
      verdict: gscUrlInspection.verdict,
      coverageState: gscUrlInspection.coverageState,
      lastCrawlTime: gscUrlInspection.lastCrawlTime,
    })
    .from(gscUrlInspection)
    .orderBy(gscUrlInspection.url);
  return rows.map((r) => ({
    url: r.url,
    verdict: r.verdict,
    coverageState: r.coverageState,
    lastCrawlTime: r.lastCrawlTime,
  }));
}

// Latest sync time across the stored rows — the "data as of" caption (null when
// nothing has synced yet). The dashboard gates the GSC cards on isGscConfigured()
// (env-only) before calling this, so it fans this out alongside the data reads.
export async function getLastSyncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastSyncedAt: sql<Date | null>`max(${gscSearchAnalytics.syncedAt})` })
    .from(gscSearchAnalytics);
  return row?.lastSyncedAt ?? null;
}
