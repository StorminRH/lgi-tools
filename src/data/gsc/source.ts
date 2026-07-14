import { JWT } from 'google-auth-library';
import { requireEnv } from '@/lib/env';
import {
  GSC_SCOPE,
  SEARCH_ANALYTICS_ROW_LIMIT,
  URL_INSPECTION_ENDPOINT,
  WEBMASTERS_V3_BASE,
} from './constants';
import type { IndexStatusApiResult, SearchAnalyticsApiRow, SitemapApiEntry } from './types';

// External calls to the Google Search Console API. Like the market-prices
// source layer, this uses plain `fetch` with no transaction open and no DB
// connection pinned — the ingest layer owns persistence. The data slice never
// imports telemetry; the cron threads sync outcomes into usage_logs itself.

// Lazily-built, module-scoped JWT client. google-auth-library caches and
// auto-refreshes the access token internally, so one client per process is
// enough. Built on first use so module import stays side-effect-free.
let _jwt: JWT | undefined;

// The service-account key is provided as one-line JSON; we also accept a
// base64-encoded blob in case an env store mangles the embedded newlines.
function parseServiceAccount(raw: string): { client_email: string; private_key: string } {
  const trimmed = raw.trim();
  const json = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

function getJwt(): JWT {
  if (_jwt) return _jwt;
  const raw = requireEnv('GSC_SERVICE_ACCOUNT_JSON');
  const { client_email, private_key } = parseServiceAccount(raw);
  _jwt = new JWT({ email: client_email, key: private_key, scopes: [GSC_SCOPE] });
  return _jwt;
}

export function siteUrl(): string {
  return requireEnv('GSC_SITE_URL');
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const { token } = await getJwt().getAccessToken();
  if (!token) throw new Error('Failed to obtain a Google access token');
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GSC ${res.status} ${res.statusText} for ${url}: ${body.slice(0, 300)}`);
  }
  return res;
}

function searchAnalyticsUrl(): string {
  return `${WEBMASTERS_V3_BASE}/sites/${encodeURIComponent(siteUrl())}/searchAnalytics/query`;
}

// One Search Analytics query, paginated on startRow until a short page signals
// the end. `dimensions` are the raw API dimension names (e.g. ['date'] or
// ['date','query']) and map to each returned row's `keys` array positionally.
export async function querySearchAnalytics(args: {
  startDate: string;
  endDate: string;
  dimensions: string[];
}): Promise<SearchAnalyticsApiRow[]> {
  const rows: SearchAnalyticsApiRow[] = [];
  let startRow = 0;
  for (;;) {
    const res = await authedFetch(searchAnalyticsUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: args.startDate,
        endDate: args.endDate,
        dimensions: args.dimensions,
        type: 'web',
        dataState: 'final',
        rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
        startRow,
      }),
    });
    const body = (await res.json()) as { rows?: SearchAnalyticsApiRow[] };
    const page = body.rows ?? [];
    rows.push(...page);
    if (page.length < SEARCH_ANALYTICS_ROW_LIMIT) break;
    startRow += SEARCH_ANALYTICS_ROW_LIMIT;
  }
  return rows;
}

export async function listSitemaps(): Promise<SitemapApiEntry[]> {
  const url = `${WEBMASTERS_V3_BASE}/sites/${encodeURIComponent(siteUrl())}/sitemaps`;
  const res = await authedFetch(url);
  const body = (await res.json()) as { sitemap?: SitemapApiEntry[] };
  return body.sitemap ?? [];
}

// Inspect one URL; returns just the index-status half (the dashboard reads
// verdict / coverage / last-crawl). Null when Google returns no index status.
export async function inspectUrl(url: string): Promise<IndexStatusApiResult | null> {
  const res = await authedFetch(URL_INSPECTION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: siteUrl() }),
  });
  const body = (await res.json()) as {
    inspectionResult?: { indexStatusResult?: IndexStatusApiResult };
  };
  return body.inspectionResult?.indexStatusResult ?? null;
}
