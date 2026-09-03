/** CCP's legacy error-limit ceiling: 100 non-2xx/3xx per 60s window. */
export const ESI_ERROR_CEILING = 100;

export const BODY_CACHE_MAX_BYTES = 131_072;

export const ERROR_COUNT_TTL_SECONDS = 120;
export const GROUP_STATE_TTL_SECONDS = 1200;
export const ETAG_TTL_SECONDS = 172_800;

export interface CachedEtagMeta {
  etag: string;
  expires: string | null;
  contentType: string | null;
}

export interface PreDispatchState {
  effectiveRemaining: number;
  blockedRetryAfter: number | null;
  etag: CachedEtagMeta | null;
}

export interface EsiBudgetSnapshot {
  effectiveRemaining: number;
  selfCount: number;
  echo: number | null;
  source: 'shared' | 'process-local';
}

export interface EsiReport {
  url: string;
  status: number;
  errorLimitRemain: number | null;
  errorLimitReset: number | null;
  rateLimitGroup: string | null;
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitUsed: number | null;
  retryAfter: number | null;
  etagToStore: (CachedEtagMeta & { body: string }) | null;
  refreshEtag: CachedEtagMeta | null;
}

export interface EsiScoreboard {
  preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState>;
  budgetSnapshot(): Promise<EsiBudgetSnapshot>;
  report(report: EsiReport): Promise<void>;
  getCachedBody(url: string): Promise<string | null>;
}
