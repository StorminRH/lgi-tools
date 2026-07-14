import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Google Search Console snapshots — a daily backend cron pulls these and the
// admin dashboard reads only the stored copy (never calls Google on page load).
// Deliberately separate from `usage_logs`: GSC is external, Google-owned,
// periodically-synced data, not first-party telemetry. The two are shown side
// by side but never share a table.
//
// GSC enum-ish fields (verdict, coverageState, …) are plain `text`: they're
// Google's vocabulary, not ours, so the "pg enums from a TS as-const array"
// invariant doesn't apply (same reasoning as `market_prices.source`).

// Search Analytics at daily grain. One table serves the site-total trend
// (dimension='total') plus the per-day query/page breakdowns ('query'/'page'),
// so any dashboard horizon is a SQL aggregation over these rows. CTR is derived
// at read time (clicks/impressions), never stored, so it can't drift.
export const gscSearchAnalytics = pgTable(
  'gsc_search_analytics',
  {
    date: date('date').notNull(),
    dimension: text('dimension').notNull(), // 'total' | 'query' | 'page'
    key: text('key').notNull(), // query string / page url / '' for totals
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    position: doublePrecision('position').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.dimension, t.key] }),
    index('gsc_search_analytics_dimension_date_idx').on(t.dimension, t.date),
  ],
);

// One row per submitted sitemap. submitted/indexed are summed over the API's
// `contents[]` — the affordable indexing-coverage proxy (there is no bulk
// index-coverage API). Snapshot, not range-bound.
export const gscSitemaps = pgTable('gsc_sitemaps', {
  path: text('path').primaryKey(),
  lastSubmitted: timestamp('last_submitted', { withTimezone: true }),
  lastDownloaded: timestamp('last_downloaded', { withTimezone: true }),
  isPending: boolean('is_pending').notNull().default(false),
  isSitemapsIndex: boolean('is_sitemaps_index').notNull().default(false),
  type: text('type'),
  warnings: bigint('warnings', { mode: 'number' }).notNull().default(0),
  errors: bigint('errors', { mode: 'number' }).notNull().default(0),
  submitted: bigint('submitted', { mode: 'number' }).notNull().default(0),
  indexed: bigint('indexed', { mode: 'number' }).notNull().default(0),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});

// One inspection result per sitemap URL per UTC day. History is intentionally
// retained so every dashboard horizon remains truthful; the latest-state read
// uses the URL/date index rather than overwriting prior observations.
export const gscUrlInspection = pgTable(
  'gsc_url_inspection',
  {
    inspectionDate: date('inspection_date').notNull(),
    url: text('url').notNull(),
    verdict: text('verdict'),
    coverageState: text('coverage_state'),
    robotsTxtState: text('robots_txt_state'),
    indexingState: text('indexing_state'),
    pageFetchState: text('page_fetch_state'),
    lastCrawlTime: timestamp('last_crawl_time', { withTimezone: true }),
    googleCanonical: text('google_canonical'),
    userCanonical: text('user_canonical'),
    crawledAs: text('crawled_as'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.inspectionDate, t.url] }),
    index('gsc_url_inspection_url_date_idx').on(t.url, t.inspectionDate),
  ],
);
