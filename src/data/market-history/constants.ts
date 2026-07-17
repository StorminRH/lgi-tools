// Shared constants for the market-history slice. Its own module so client
// components can import the cap/windows without pulling the server-only
// source/queries (and their drizzle/postgres deps) into the client bundle.

/**
 * The Forge region — Jita. Re-declared locally rather than imported from
 * market-prices: data slices never import each other (fallow boundary rules,
 * .fallowrc.json). The shared value is CCP's region ID, not app state.
 */
export const THE_FORGE_REGION_ID = 10000002;

/**
 * How many trailing days of daily history to retain per type. ESI serves a
 * ~13-month rolling window; we keep ~400 days, which covers every scoring
 * window plus headroom for the breakdown UI, and bounds storage as the window
 * slides. Rows older than this are pruned on each refresh.
 */
export const HISTORY_RETENTION_DAYS = 400;

/**
 * Trailing windows (days) over which average daily volume is reported. 3.5.3b
 * chooses which to weight; it can re-derive other windows from the raw rows
 * (getStoredHistory) if needed.
 */
export const HISTORY_ADV_WINDOWS = [7, 30, 90] as const;

/**
 * Window (days) for the demand-consistency (volume CV) and price-stability
 * (price volatility) signals — the common one-month stability horizon.
 */
export const HISTORY_STABILITY_WINDOW_DAYS = 30;

/**
 * Max typeIds a single on-demand history refresh may request. The on-view
 * trigger asks for one product type; the cap leaves room for a small set
 * (e.g. a future material-history consumer) while throttling a scraper.
 */
export const ON_DEMAND_HISTORY_MAX_TYPE_IDS = 50;

/**
 * Max concurrent per-type ESI history fetches. History is per-type only (no
 * region-dump analogue), so a refresh of N stale types is N calls; 10-wide
 * matches the market-prices per-type cadence.
 */
export const HISTORY_FETCH_CONCURRENCY = 10;

/**
 * IP-keyed rate limit on the public on-demand history refresh trigger
 * (/api/market-history/refresh). Generous for the real consumer (one product
 * type per blueprint view) while clearly throttling a scraper.
 */
export const ON_DEMAND_HISTORY_LIMIT_PER_MINUTE = 20;

/**
 * Per-type cache tag for the cached inputs read. The on-view write-behind busts
 * it (revalidateTag) the moment a refresh persists fresh rows. Lives here (not
 * the engine) so the cached query and the engine share it without a cycle.
 */
export function historyTag(typeId: number): string {
  return `market-history-${typeId}`;
}
