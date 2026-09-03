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

export const gscSearchAnalytics = pgTable(
  'gsc_search_analytics',
  {
    date: date('date').notNull(),
    dimension: text('dimension').notNull(),
    key: text('key').notNull(),
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

export const gscUrlInspection = pgTable(
  'gsc_url_inspection',
  {
    inspectionDate: date('inspection_date').notNull(),
    url: text('url').notNull(),

    sitemapUrlCount: integer('sitemap_url_count'),
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
