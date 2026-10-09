/** CCP's legacy error-limit ceiling: 100 non-2xx/3xx per 60s window. */
export const ESI_ERROR_CEILING = 100;

export const BODY_CACHE_MAX_BYTES = 131_072;

export const ERROR_COUNT_TTL_SECONDS = 120;

/** Minutes of ESI calls the availability readout covers. */
export const AVAILABILITY_WINDOW_MINUTES = 60;
/** Outlives the window so no bucket expires while it is still being read. */
export const CALL_COUNT_TTL_SECONDS = (AVAILABILITY_WINDOW_MINUTES + 5) * 60;
/** The status a dispatch reports when ESI gave no answer at all. */
export const NO_RESPONSE_STATUS = 0;
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

/**
 * Every call the gate dispatched over the availability window, and how many
 * of them failed: no answer, held back by ESI, or a server error.
 */
export interface EsiAvailabilitySnapshot {
  calls: number;
  failures: number;
  source: 'shared' | 'process-local';
}

export interface EsiReport {
  url: string;
  /** The HTTP status, or NO_RESPONSE_STATUS when the dispatch got none. */
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
  availabilitySnapshot(): Promise<EsiAvailabilitySnapshot>;
  report(report: EsiReport): Promise<void>;
  getCachedBody(url: string): Promise<string | null>;
}
