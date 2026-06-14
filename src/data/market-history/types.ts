// Public types for the market-history slice.

// One day of CCP-computed market history for a type in The Forge — the daily
// record ESI returns, plus our bigint volume (matching market_prices' volume
// columns and giving headroom). No typeId: rows are always grouped by type.
export interface HistoryDailyRow {
  // ESI's calendar day, "YYYY-MM-DD" (stored as a DATE in string mode — no TZ).
  date: string;
  // Volume-weighted average price that day.
  average: number;
  highest: number;
  lowest: number;
  // Units traded that day. A day with no trades has no row at all.
  volume: bigint;
  // Distinct orders that contributed to the day's trades.
  orderCount: number;
}

// Provenance of a stored history series. ESI is the only source — history has
// no Fuzzwork (orders) fallback. A union keeps the meta column extensible.
export type HistorySource = 'esi';

// Source-shaped record before persistence: a type's full returned series plus
// the freshness the ESI Expires header dictates.
export interface RawHistory {
  typeId: number;
  rows: HistoryDailyRow[];
  // From the response Expires header (next CCP recompute, ~11:05 UTC), the
  // per-type stale_after the on-view gate reads. Fallback now+24h upstream.
  staleAfter: Date;
  source: HistorySource;
}

// Average daily traded volume over one trailing window.
export interface AdvWindow {
  days: number;
  // units/day; null when the window holds no data.
  adv: number | null;
}

// The typed scoring inputs the 3.5.3b Market Score reads — computed from the
// stored daily rows by pure functions in aggregate.ts. Every field is a plain
// number/string, so this crosses the wire unchanged (no bigint).
export interface MarketHistoryInputs {
  typeId: number;
  // Demand intensity: average daily volume over HISTORY_ADV_WINDOWS.
  averageDailyVolume: AdvWindow[];
  // Demand consistency: coefficient of variation (stddev/mean) of daily volume
  // over the stability window, zero-filling traded-nothing days. null when the
  // window has no data. Higher = spikier/less reliable demand.
  volumeCv: number | null;
  // Price stability: coefficient of variation of the daily average price over
  // the stability window. null when <2 priced days. Higher = more wobble.
  priceVolatility: number | null;
  // Coverage: distinct days with data inside the stability window (out of its
  // length) — lets the score down-weight thin series.
  daysCovered: number;
  // Most recent day with data, "YYYY-MM-DD" (null when no rows). The consumer
  // compares it to today to judge staleness — separate from intensity.
  latestDate: string | null;
}
