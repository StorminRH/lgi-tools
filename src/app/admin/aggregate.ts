import type { Delta } from './period';
import { computeDelta } from './period';

// Pure daily-series analytics for the admin dashboard's Part D charts. No I/O,
// no clock — callers pass the sparse query rows plus the calendar bounds, and
// these functions expand, smooth, and summarize. The section loaders compose
// them so the client chart components receive only plain numbers and never
// re-derive analytics. Exported functions are unit-tested directly.

const MS_PER_DAY = 86_400_000;

/**
 * Integer day number for a 'YYYY-MM-DD' string at UTC midnight. Integer day
 * arithmetic sidesteps any timezone/DST drift (same approach as market-history).
 */
export function toDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

/** 'YYYY-MM-DD' for an integer UTC day number — the inverse of toDayNumber. */
export function dayString(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

/** UTC weekend test for a 'YYYY-MM-DD' day (Sunday = 0, Saturday = 6). */
export function isWeekend(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

export interface DailySeries {
  /** Continuous calendar days [startDay, endDay] inclusive, ascending. */
  days: string[];
  /** Value per day; 0 where the source had no row (a real no-activity day). */
  values: number[];
  /** Weekend flag per day, parallel to `days`. */
  weekend: boolean[];
}

/**
 * Expand sparse `{ day, value }` rows into a continuous daily series over the
 * inclusive span [startDay, endDay], zero-filling absent days. A no-activity
 * day inside an active period is a genuine 0 (bars should show it); the caller
 * chooses the span so pre-launch days are never fabricated as zeros. Rows
 * outside the span are ignored; the last write wins on duplicate days.
 */
export function zeroFillDaily(
  rows: { day: string; value: number }[],
  startDay: string,
  endDay: string,
): DailySeries {
  const start = toDayNumber(startDay);
  const end = toDayNumber(endDay);
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const days: string[] = [];
  const values: number[] = [];
  const weekend: boolean[] = [];
  for (let d = start; d <= end; d += 1) {
    const key = dayString(d);
    days.push(key);
    values.push(byDay.get(key) ?? 0);
    weekend.push(isWeekend(key));
  }
  return { days, values, weekend };
}

/**
 * Trailing moving average aligned 1:1 with a continuous daily series:
 * `average[i] = mean(values[max(0, i - window + 1) .. i])`. Early points average
 * the days available so the line is defined from the first point. A window \< 1
 * returns a copy; an empty series returns [].
 */
export function movingAverage(values: number[], window: number): number[] {
  if (window < 1) return values.slice();
  const out: number[] = [];
  let running = 0;
  for (let i = 0; i < values.length; i += 1) {
    running += values[i]!;
    if (i >= window) running -= values[i - window]!;
    out.push(running / Math.min(i + 1, window));
  }
  return out;
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Arithmetic mean; 0 for an empty list (callers gate emptiness before display). */
export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/**
 * Week-over-week delta from the tail of a daily series: the last 7 days' total
 * vs the 7 days before. Null when fewer than 14 days exist — the end-label then
 * shows the value without a trend arrow rather than a misleading one.
 */
export function weekOverWeekDelta(values: number[]): Delta | null {
  if (values.length < 14) return null;
  return computeDelta(sum(values.slice(-7)), sum(values.slice(-14, -7)));
}
