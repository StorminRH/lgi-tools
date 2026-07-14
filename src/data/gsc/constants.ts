// Shared constants for the Google Search Console slice. Kept free of the
// google-auth-library / drizzle imports (those live in source.ts / ingest.ts)
// so the dashboard read path (queries.ts) can import `isGscConfigured` without
// dragging the Google client into the admin page's server bundle.

// Advisory-lock id for the daily GSC sync cron — skips an overlapping run of
// itself under Vercel's at-least-once cron delivery, so a duplicate dispatch
// can't double-pull the quota'd GSC API. Distinct from the SDE (…013) and
// industry-indices (…014) lock ids; the prices cron is deliberately lock-free
// (last-write-wins), so it claims no id here.
export const ADVISORY_LOCK_GSC_SYNC = BigInt(8273619015);

// Read-only scope — covers Search Analytics, Sitemaps, AND URL Inspection.
// (URL Inspection needs `webmasters.readonly` specifically, not the newer
// `searchconsole` scope.) We never request write scope: no sitemap submit, no
// indexing requests — this slice reads and reports only.
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

// Search Analytics + Sitemaps live under the classic webmasters/v3 host; URL
// Inspection is the newer searchconsole/v1 surface.
export const WEBMASTERS_V3_BASE = 'https://www.googleapis.com/webmasters/v3';
export const URL_INSPECTION_ENDPOINT =
  'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

// GSC data lags ~2–3 days and finalizes late, so each daily run re-pulls a
// trailing window and upserts (self-healing). 90 days covers the dashboard's
// widest fixed horizon; the `all` horizon aggregates whatever retained history
// has accumulated.
export const GSC_WINDOW_DAYS = 90;

// Stored Search Analytics and URL Inspection history stays substantially wider
// than every fixed dashboard range while remaining bounded. The daily GSC cron
// prunes both tables to this horizon after each sync attempt.
export const GSC_RETENTION_DAYS = 400;

// Search Analytics returns at most 25,000 rows per request; we page on startRow.
export const SEARCH_ANALYTICS_ROW_LIMIT = 25000;

// Upsert chunk size — keeps a single INSERT under Postgres' 65,535-param ceiling
// regardless of driver (a 90-day × many-query pull can be a few thousand rows).
export const UPSERT_CHUNK_ROWS = 500;

// URL Inspection is limited to 2,000 requests/day and 600 requests/minute per
// property. The sitemap currently carries 111 URLs; fail the whole inspection
// surface above this ceiling so a growing sitemap cannot silently consume the
// quota or publish misleading partial coverage.
export const GSC_INSPECTION_URL_LIMIT = 500;
export const GSC_INSPECTION_BATCH_SIZE = 5;

// The sync is disabled (cron no-ops, dashboard hides the GSC cards) unless both
// the service-account credential and the verified property string are present.
export function isGscConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GSC_SERVICE_ACCOUNT_JSON && env.GSC_SITE_URL);
}
