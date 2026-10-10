import { readEnv } from '@/lib/env';

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

export function isGscConfigured(): boolean {
  return Boolean(readEnv('GSC_SERVICE_ACCOUNT_JSON') && readEnv('GSC_SITE_URL'));
}
