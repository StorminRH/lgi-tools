export const THE_FORGE_REGION_ID = 10000002;

/**
 * How many trailing days of daily history to retain per type. ESI serves a
 * ~13-month rolling window; we keep ~400 days, which covers every scoring
 * window plus headroom for the breakdown UI, and bounds storage as the window
 * slides. Rows older than this are pruned on each refresh.
 */
export const HISTORY_RETENTION_DAYS = 400;

export const HISTORY_ADV_WINDOWS = [7, 30, 90] as const;

export const HISTORY_STABILITY_WINDOW_DAYS = 30;

export const ON_DEMAND_HISTORY_MAX_TYPE_IDS = 50;

export const HISTORY_FETCH_CONCURRENCY = 10;

export const ON_DEMAND_HISTORY_LIMIT_PER_MINUTE = 20;

export function historyTag(typeId: number): string {
  return `market-history-${typeId}`;
}
