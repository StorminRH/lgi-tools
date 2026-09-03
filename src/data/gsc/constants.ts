/**
 * Advisory-lock id for the daily GSC sync cron — skips an overlapping run of
 * itself under Vercel's at-least-once cron delivery, so a duplicate dispatch
 * can't double-pull the quota'd GSC API. Distinct from the SDE (…013) and
 * industry-indices (…014) lock ids; the prices cron is deliberately lock-free
 * (last-write-wins), so it claims no id here.
 */
export const ADVISORY_LOCK_GSC_SYNC = BigInt(8273619015);

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export const WEBMASTERS_V3_BASE = 'https://www.googleapis.com/webmasters/v3';
export const URL_INSPECTION_ENDPOINT =
  'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

export const GSC_WINDOW_DAYS = 90;

export const GSC_RETENTION_DAYS = 400;

export const SEARCH_ANALYTICS_ROW_LIMIT = 25000;

export const UPSERT_CHUNK_ROWS = 500;

export const GSC_INSPECTION_URL_LIMIT = 500;
export const GSC_INSPECTION_BATCH_SIZE = 5;

export function isGscConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GSC_SERVICE_ACCOUNT_JSON && env.GSC_SITE_URL);
}
