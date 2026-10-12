/** CCP's legacy error-limit ceiling: 100 non-2xx/3xx per 60s window. */
export const ESI_ERROR_CEILING = 100;

export const ERROR_COUNT_TTL_SECONDS = 120;

/** Minutes of ESI calls the availability readout covers. */
export const AVAILABILITY_WINDOW_MINUTES = 60;
/** Outlives the window so no bucket expires while it is still being read. */
export const CALL_COUNT_TTL_SECONDS = (AVAILABILITY_WINDOW_MINUTES + 5) * 60;
/** The status a dispatch reports when ESI gave no answer at all. */
export const NO_RESPONSE_STATUS = 0;

/**
 * How long a rate-limit group's echoed Remaining is trusted, lowest wins:
 * one window of answers from every instance on this egress IP.
 */
export const GROUP_ECHO_TTL_SECONDS = 60;
/** How long a path's rate-limit group is remembered; CCP fixes the group per route. */
export const GROUP_OF_PATH_TTL_SECONDS = 24 * 60 * 60;
/** The share of a group's limit below which the gate refuses: non-interactive calls first, interactive ones later. */
export const GROUP_FLOOR_SHARE = 0.1;
export const GROUP_FLOOR_SHARE_INTERACTIVE = 0.05;
/**
 * Market-history calls a minute across every instance, under CCP's
 * unconfirmed 300/min/IP: the only ESI route with a per-minute rule and
 * no group header.
 */
export const HISTORY_CALLS_PER_MINUTE = 250;
export const HISTORY_COUNT_TTL_SECONDS = 120;

/** The lowest Remaining echoed for a rate-limit group within the echo window, with the group's limit. */
export interface GroupBudget {
  group: string;
  remaining: number;
  limit: number;
}

export interface PreDispatchState {
  effectiveRemaining: number;
  /** The longer of the path's and its group's 429 blocks, in seconds, or null when neither holds. */
  blockedRetryAfter: number | null;
  /** Present once the path's group and its echoed Remaining are known. */
  groupBudget?: GroupBudget;
  /** Present for a market-history path: the calls counted this minute across every instance. */
  historyCalls?: number;
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
  retryAfter: number | null;
  /** The answer's rate-limit group and its headers, null where the answer carried none (history, prices, a 429 without headers). */
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
}

export interface EsiScoreboard {
  preDispatch(url: string): Promise<PreDispatchState>;
  budgetSnapshot(): Promise<EsiBudgetSnapshot>;
  availabilitySnapshot(): Promise<EsiAvailabilitySnapshot>;
  report(report: EsiReport): Promise<void>;
}
