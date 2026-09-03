export interface GscRange {
  from: Date;
  to: Date;
}

export interface SearchAnalyticsApiRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SitemapContent {
  type?: string;
  submitted?: string | number;
  indexed?: string | number;
}

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

export type GscDimension = 'total' | 'query' | 'page';

export interface GscSyncSummary {
  status: 'synced' | 'partial' | 'skipped' | 'failed';
  reason?: string;
  searchRows: number;
  sitemaps: number;
  urlsInspected: number;
  errors: string[];
  durationMs: number;
}

export interface GscDailyPoint {
  day: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscTermStat {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSitemapStatus {
  path: string;
  lastDownloaded: Date | null;
  isPending: boolean;
  warnings: number;
  errors: number;
  submitted: number;
  indexed: number;
}

export interface GscUrlStatus {
  inspectionDate: string | null;
  url: string;
  verdict: string | null;
  coverageState: string | null;
  lastCrawlTime: Date | null;
}

export interface GscCoverageDailyPoint {
  day: string;
  indexed: number;
  notIndexed: number;
}
