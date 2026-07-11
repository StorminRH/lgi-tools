import {
  HISTORY_ADV_WINDOWS,
  HISTORY_STABILITY_WINDOW_DAYS,
} from './constants';
import type { HistoryDailyRow, MarketHistoryInputs } from './types';

// Pure aggregation of stored daily rows into the typed scoring inputs the
// 3.5.3b Market Score reads. No I/O, no clock — `asOf` (the reference day) is
// derived from the data itself (the latest row), so the functions are
// deterministic and testable, and staleness-vs-today stays a separate signal
// the consumer derives from `latestDate`. Exported sub-functions are unit-tested
// directly; computeHistoryInputs composes them.

// Days since the Unix epoch for a "YYYY-MM-DD" string (UTC midnight). Integer
// day arithmetic avoids any timezone/DST drift.
function toDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

// Rows whose date falls in the trailing window [asOf - windowDays + 1, asOf].
function rowsInWindow(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): HistoryDailyRow[] {
  const end = toDayNumber(asOf);
  const start = end - windowDays + 1;
  return rows.filter((r) => {
    const d = toDayNumber(r.date);
    return d >= start && d <= end;
  });
}

// The rows in a trailing window plus their total traded volume — null when the
// window holds no rows ("no data" ≠ "zero"). The shared prologue of the two
// volume statistics.
function windowVolumeTotal(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): { inWindow: HistoryDailyRow[]; total: number } | null {
  const inWindow = rowsInWindow(rows, windowDays, asOf);
  if (inWindow.length === 0) return null;
  let total = 0;
  for (const r of inWindow) total += Number(r.volume);
  return { inWindow, total };
}

// Average daily volume over a trailing window: total units traded ÷ the window's
// CALENDAR length, so traded-nothing days (no row) correctly pull the average
// down. null when the window holds no rows ("no data" ≠ "zero").
export function averageDailyVolume(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number | null {
  const w = windowVolumeTotal(rows, windowDays, asOf);
  if (w === null) return null;
  return w.total / windowDays;
}

// Coefficient of variation (stddev/mean) of daily volume over a trailing
// window, ZERO-FILLING days with no trades — a market that trades hard for
// three days then goes quiet is inconsistent, and the zero days are what show
// it. Population stddev over the window's calendar length. null when the window
// has no data or a zero mean.
export function volumeCoefficientOfVariation(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number | null {
  const w = windowVolumeTotal(rows, windowDays, asOf);
  if (w === null) return null;
  const { inWindow, total } = w;
  const mean = total / windowDays;
  if (mean === 0) return null;
  // Σ(v - mean)² over all calendar days: present days contribute (v - mean)²,
  // the (windowDays - present) absent days each contribute (0 - mean)² = mean².
  let sumSq = 0;
  for (const r of inWindow) {
    const d = Number(r.volume) - mean;
    sumSq += d * d;
  }
  const absent = windowDays - inWindow.length;
  sumSq += absent * mean * mean;
  const stddev = Math.sqrt(sumSq / windowDays);
  return stddev / mean;
}

// Price volatility: coefficient of variation (stddev/mean) of the daily average
// price over a trailing window, across the days that traded (no zero-fill —
// price has no value on a no-trade day). null when fewer than 2 priced days.
export function priceVolatility(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number | null {
  const inWindow = rowsInWindow(rows, windowDays, asOf);
  if (inWindow.length < 2) return null;
  let total = 0;
  for (const r of inWindow) total += r.average;
  const mean = total / inWindow.length;
  if (mean === 0) return null;
  let sumSq = 0;
  for (const r of inWindow) {
    const d = r.average - mean;
    sumSq += d * d;
  }
  const stddev = Math.sqrt(sumSq / inWindow.length);
  return stddev / mean;
}

// Distinct days with data inside a trailing window — the demand-coverage input.
export function coverage(
  rows: HistoryDailyRow[],
  windowDays: number,
  asOf: string,
): number {
  return rowsInWindow(rows, windowDays, asOf).length;
}

// Compose the typed scoring inputs. `asOf` is the latest row's date (the data's
// own frame); demand intensity reflects the type's most recent active period,
// while latestDate carries the staleness the consumer judges against today.
export function computeHistoryInputs(
  typeId: number,
  rows: HistoryDailyRow[],
): MarketHistoryInputs {
  if (rows.length === 0) {
    return {
      typeId,
      averageDailyVolume: HISTORY_ADV_WINDOWS.map((days) => ({ days, adv: null })),
      volumeCv: null,
      priceVolatility: null,
      daysCovered: 0,
      latestDate: null,
    };
  }
  let latestDate = rows[0].date;
  for (const r of rows) if (r.date > latestDate) latestDate = r.date;

  return {
    typeId,
    averageDailyVolume: HISTORY_ADV_WINDOWS.map((days) => ({
      days,
      adv: averageDailyVolume(rows, days, latestDate),
    })),
    volumeCv: volumeCoefficientOfVariation(rows, HISTORY_STABILITY_WINDOW_DAYS, latestDate),
    priceVolatility: priceVolatility(rows, HISTORY_STABILITY_WINDOW_DAYS, latestDate),
    daysCovered: coverage(rows, HISTORY_STABILITY_WINDOW_DAYS, latestDate),
    latestDate,
  };
}
