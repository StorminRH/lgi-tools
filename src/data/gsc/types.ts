/**
 * ── Slice-local date range ──────────────────────────────────────────────
 * Structurally identical to telemetry's DateRange, declared here so the GSC
 * slice never imports a sibling data slice (boundary rule). The dashboard
 * passes its existing `range` object straight in.
 */
export interface GscRange {
  from: Date;
  to: Date;
}

// ── Raw GSC API row shapes (only the fields we consume) ─────────────────
// Boundary types: Google sends more keys; we read these. int64 counts arrive
// as JSON strings, so sitemap counts are typed string | number and coerced.

/**
 * One row of a searchanalytics.query response. `keys` aligns with the
 * requested `dimensions` array (e.g. ['date'] or ['date','query']).
 */
export interface SearchAnalyticsApiRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Parsed sitemap document containing its canonical URL entries. */
export interface SitemapContent {
  type?: string;
  submitted?: string | number;
  indexed?: string | number;
}

/** Search Console sitemap API record normalized to the fields used by ingestion. */
export interface SitemapApiEntry {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  warnings?: string | number;
  errors?: string | number;
  contents?: SitemapContent[];
}

/**
 * urlInspectionResult.inspectionResult.indexStatusResult — the index-status
 * half of a URL Inspection. All fields optional; Google omits what it lacks.
 */
export interface IndexStatusApiResult {
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
  crawledAs?: string;
}

/**
 * ── Which search-analytics grouping a stored row came from ──────────────
 * 'total' = the daily site totals (dimensions=['date']); 'query'/'page' = the
 * per-day breakdowns (dimensions=['date','query'|'page']).
 */
export type GscDimension = 'total' | 'query' | 'page';

/** ── Sync summary (mirrors market-prices' RefreshSummary) ──────────────── */
export interface GscSyncSummary {
  status: 'synced' | 'partial' | 'skipped' | 'failed';
  // Present when status is 'skipped' (e.g. 'not_configured') or 'failed'.
  reason?: string;
  searchRows: number;
  sitemaps: number;
  urlsInspected: number;
  // Per-surface failures recorded while still persisting what did land — a
  // partial sync leaves the prior snapshot intact rather than breaking.
  errors: string[];
  durationMs: number;
}

/**
 * ── Dashboard read shapes ───────────────────────────────────────────────
 * One day of site-total search performance (for the trend charts).
 */
export interface GscDailyPoint {
  day: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** Range-aggregated headline numbers. CTR derived (clicks/impressions). */
export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** A top query or page over the range. CTR derived; position impression-weighted. */
export interface GscTermStat {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Stored Search Console sitemap status with submission, crawl, warning, and error counts. */
export interface GscSitemapStatus {
  path: string;
  lastDownloaded: Date | null;
  isPending: boolean;
  warnings: number;
  errors: number;
  submitted: number;
  indexed: number;
}

/** Latest URL inspection state for one canonical sitemap URL. */
export interface GscUrlStatus {
  inspectionDate: string | null;
  url: string;
  verdict: string | null;
  coverageState: string | null;
  lastCrawlTime: Date | null;
}

/** UTC day coverage snapshot with indexed and not-indexed URL counts. */
export interface GscCoverageDailyPoint {
  day: string;
  indexed: number;
  notIndexed: number;
}
